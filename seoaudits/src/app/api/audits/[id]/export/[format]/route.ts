import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { ExportFormatSchema } from '@/lib/validators/audit';
import { computeReportInsights } from '@/services/audit/reportInsights';
import { generatePdfHtml } from '@/services/audit/pdfTemplate';
import { checkRateLimit, EXPORT_RATE_LIMIT } from '@/lib/rateLimit';
import { getPlanTier } from '@/lib/planTiers';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { STEP_NAMES } from '@/services/queue/config';
import { logSecurityEvent } from '@/lib/securityLogger';

// GET /api/audits/:id/export/:format — Export audit report
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> }
) {
  try {
    const user = await requireUser();
    const { id, format } = await params;
    const { format: validFormat } = ExportFormatSchema.parse({ format });

    // Rate limit exports
    const rl = await checkRateLimit(`export:${user.id}`, EXPORT_RATE_LIMIT);
    if (!rl.success) {
      logSecurityEvent({ type: 'RATE_LIMIT_HIT', userId: user.id, path: `/api/audits/${id}/export/${format}`, details: 'Export rate limit exceeded' });
      return NextResponse.json(
        { error: 'Export rate limit reached. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
      );
    }

    // Plan tier enforcement
    const tier = getPlanTier(user.plan);
    const [pdfFlagEnabled, csvFlagEnabled, jsonFlagEnabled] = await Promise.all([
      isFeatureEnabled(
        'export.pdf',
        user.plan as 'free' | 'starter' | 'pro' | 'enterprise'
      ),
      isFeatureEnabled(
        'export.csv',
        user.plan as 'free' | 'starter' | 'pro' | 'enterprise'
      ),
      isFeatureEnabled(
        'export.json',
        user.plan as 'free' | 'starter' | 'pro' | 'enterprise'
      ),
    ]);

    if (validFormat === 'pdf' && !pdfFlagEnabled) {
      return NextResponse.json(
        { error: 'PDF export is currently disabled by admin.' },
        { status: 403 }
      );
    }
    if (
      (validFormat === 'pages-csv' ||
        validFormat === 'issues-csv' ||
        validFormat === 'ai-citations-csv' ||
        validFormat === 'ai-citations-history-csv') &&
      !csvFlagEnabled
    ) {
      return NextResponse.json(
        { error: 'CSV export is currently disabled by admin.' },
        { status: 403 }
      );
    }
    if (validFormat === 'json' && !jsonFlagEnabled) {
      return NextResponse.json(
        { error: 'JSON export is currently disabled by admin.' },
        { status: 403 }
      );
    }

    if (validFormat === 'pdf' && !tier.pdfExport) {
      logSecurityEvent({ type: 'EXPORT_DENIED', userId: user.id, path: `/api/audits/${id}/export/pdf`, details: 'PDF export not in plan' });
      return NextResponse.json(
        { error: 'PDF export is not available on your plan. Upgrade to Starter or higher.' },
        { status: 403 }
      );
    }
    if (validFormat !== 'pdf' && !tier.dataExport) {
      logSecurityEvent({ type: 'EXPORT_DENIED', userId: user.id, path: `/api/audits/${id}/export/${format}`, details: 'Data export not in plan' });
      return NextResponse.json(
        { error: 'Data export is not available on your plan. Upgrade to Starter or higher.' },
        { status: 403 }
      );
    }

    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      include: {
        pages: { orderBy: { url: 'asc' } },
        issues: {
          orderBy: [{ severity: 'asc' }, { stepNumber: 'asc' }],
          include: { auditPage: { select: { url: true, titleTag: true, httpStatus: true } } },
        },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // ── JSON ────────────────────────────────────────────────
    if (validFormat === 'json') {
      const aiEvidence = await fetchAICitationEvidence(id);
      const aiCitationHistory = await fetchAICitationConfidenceHistory(user.id, audit.targetDomain);
      return NextResponse.json(
        {
          ...audit,
          aiCitations: aiEvidence,
          aiCitationHistory,
        },
        {
        headers: {
          'Content-Disposition': `attachment; filename="${slugify(audit.targetDomain)}-audit.json"`,
        },
      });
    }

    // ── Pages CSV ───────────────────────────────────────────
    if (validFormat === 'pages-csv') {
      const csv = generatePagesCsv(audit.pages);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slugify(audit.targetDomain)}-pages.csv"`,
        },
      });
    }

    // ── Issues CSV ──────────────────────────────────────────
    if (validFormat === 'issues-csv') {
      const selected = new Set(audit.selectedSteps);
      const csv = generateIssuesCsv(
        audit.issues.filter((issue) => selected.has(issue.stepNumber))
      );
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slugify(audit.targetDomain)}-issues.csv"`,
        },
      });
    }

    // --- AI Citations CSV ----------------------------------------------------
    if (validFormat === 'ai-citations-csv') {
      const aiEvidence = await fetchAICitationEvidence(id);
      const csv = generateAICitationsCsv(aiEvidence.rows);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slugify(audit.targetDomain)}-ai-citations.csv"`,
        },
      });
    }

    if (validFormat === 'ai-citations-history-csv') {
      const historyRows = await fetchAICitationConfidenceHistory(user.id, audit.targetDomain);
      const csv = generateAICitationHistoryCsv(historyRows);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slugify(audit.targetDomain)}-ai-citation-history.csv"`,
        },
      });
    }

    // ── PDF ─────────────────────────────────────────────────
    if (validFormat === 'pdf') {
      if (audit.status !== 'COMPLETED') {
        return NextResponse.json(
          { error: 'PDF export is only available for completed audits' },
          { status: 400 }
        );
      }

      const reportData = buildReportData(audit);
      const aiEvidence = await fetchAICitationEvidence(id);
      const html = generatePdfHtml(reportData, {
        targetDomain: audit.targetDomain,
        completedAt: audit.completedAt?.toISOString() ?? null,
      }, aiEvidence);

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
          printBackground: true,
        });
        await page.close();
        const pdfBytes = new Uint8Array(pdfBuffer);

        return new Response(pdfBytes, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${slugify(audit.targetDomain)}-audit.pdf"`,
            'Content-Length': String(pdfBytes.byteLength),
          },
        });
      } finally {
        await browser.close();
      }
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid export format.' },
        { status: 400 }
      );
    }
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── CSV Generators ──────────────────────────────────────────────

interface PageRow {
  url: string;
  httpStatus: number | null;
  crawlDepth: number | null;
  performanceScore: number | null;
  inpValue: number | null;
  inpRating: string | null;
  mobileFriendly: boolean | null;
  accessibilityScore: number | null;
  domNodeCount: number | null;
  titleTag: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaDescriptionLength: number | null;
  h1Count: number | null;
  wordCount: number | null;
  internalLinksInbound: number | null;
  internalLinksOutbound: number | null;
  contentAge: number | null;
  decayBucket: string | null;
  eeatScore: number | null;
  hasAuthorByline: boolean | null;
  details: unknown;
}

/**
 * Semrush-style pages CSV with all SEO-relevant columns.
 * Extracts CWV metrics from the details JSON.
 */
export function generatePagesCsv(pages: PageRow[]): string {
  const headers = [
    'URL',
    'HTTP Status',
    'Crawl Depth',
    // Performance
    'Performance Score',
    'LCP (ms)',
    'CLS',
    'INP (ms)',
    'INP Rating',
    'TBT (ms)',
    'FCP (ms)',
    'Speed Index (ms)',
    // Mobile & A11y
    'Mobile Friendly',
    'Accessibility Score',
    // On-page SEO
    'Page Title',
    'Title Length',
    'Meta Description',
    'Meta Description Length',
    'H1 Count',
    'Word Count',
    // Technical
    'DOM Node Count',
    'Internal Links In',
    'Internal Links Out',
    // Content
    'Content Age (days)',
    'Decay Status',
    // E-E-A-T
    'E-E-A-T Score',
    'Has Author Byline',
  ];

  const rows = pages.map((p) => {
    const psi = extractPsi(p.details);
    return [
      p.url,
      p.httpStatus,
      p.crawlDepth,
      p.performanceScore !== null ? Math.round(p.performanceScore) : null,
      psi.lcpMs !== null ? Math.round(psi.lcpMs) : null,
      psi.clsValue !== null ? psi.clsValue.toFixed(3) : null,
      p.inpValue !== null ? Math.round(p.inpValue) : null,
      p.inpRating,
      psi.tbtMs !== null ? Math.round(psi.tbtMs) : null,
      psi.fcpMs !== null ? Math.round(psi.fcpMs) : null,
      psi.siMs !== null ? Math.round(psi.siMs) : null,
      p.mobileFriendly !== null ? (p.mobileFriendly ? 'Yes' : 'No') : null,
      p.accessibilityScore !== null ? Math.round(p.accessibilityScore) : null,
      p.titleTag,
      p.titleLength,
      p.metaDescription,
      p.metaDescriptionLength,
      p.h1Count,
      p.wordCount,
      p.domNodeCount,
      p.internalLinksInbound,
      p.internalLinksOutbound,
      p.contentAge,
      p.decayBucket,
      p.eeatScore !== null ? p.eeatScore.toFixed(1) : null,
      p.hasAuthorByline !== null ? (p.hasAuthorByline ? 'Yes' : 'No') : null,
    ].map(escapeCsvField).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

interface IssueRow {
  severity: string;
  stepNumber: number;
  category: string;
  message: string;
  selector: string | null;
  recommendation: string | null;
  auditPage: { url: string; titleTag: string | null; httpStatus: number | null } | null;
}

interface AICitationCsvRow {
  queryText: string;
  seedKeyword: string;
  platform: string;
  clientCited: boolean;
  citedDomains: string[];
  competitorsCited: string[];
  citationContext: string | null;
  gapCount: number;
  topGapType: string | null;
  topGapPriority: number | null;
  topGapAction: string | null;
}

interface AICitationHistoryCsvRow {
  auditRunId: string;
  completedAt: string | null;
  attemptedQueries: number;
  successfulQueries: number;
  failedQueries: number;
  confidenceScore: number | null;
}

/**
 * Semrush-style issues CSV with affected URL, page title, and actionable fix.
 */
export function generateIssuesCsv(issues: IssueRow[]): string {
  const headers = [
    'Severity',
    'Step',
    'Step Name',
    'Category',
    'Issue',
    'How to Fix',
    'CSS Selector',
    'Affected URL',
    'Page Title',
    'Page HTTP Status',
  ];

  const rows = issues.map((i) =>
    [
      i.severity,
      i.stepNumber,
      STEP_NAMES[i.stepNumber] ?? `Step ${i.stepNumber}`,
      i.category,
      i.message,
      i.recommendation,
      i.selector,
      i.auditPage?.url ?? '(site-level)',
      i.auditPage?.titleTag,
      i.auditPage?.httpStatus,
    ].map(escapeCsvField).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function generateAICitationsCsv(rows: AICitationCsvRow[]): string {
  const headers = [
    'Query',
    'Seed Keyword',
    'Platform',
    'Client Cited',
    'Cited Domains',
    'Competitors Cited',
    'Gap Count',
    'Top Gap Type',
    'Top Gap Priority',
    'Top Gap Action',
    'Citation Context',
  ];

  const dataRows = rows.map((r) =>
    [
      r.queryText,
      r.seedKeyword,
      r.platform,
      r.clientCited ? 'Yes' : 'No',
      r.citedDomains.join('; '),
      r.competitorsCited.join('; '),
      r.gapCount,
      r.topGapType,
      r.topGapPriority,
      r.topGapAction,
      r.citationContext,
    ].map(escapeCsvField).join(',')
  );

  return [headers.join(','), ...dataRows].join('\n');
}

export function generateAICitationHistoryCsv(rows: AICitationHistoryCsvRow[]): string {
  const headers = [
    'Audit Run ID',
    'Completed At (UTC)',
    'Attempted Queries',
    'Successful Queries',
    'Failed Queries',
    'Confidence Score',
  ];

  const dataRows = rows.map((r) =>
    [
      r.auditRunId,
      r.completedAt,
      r.attemptedQueries,
      r.successfulQueries,
      r.failedQueries,
      r.confidenceScore,
    ].map(escapeCsvField).join(',')
  );

  return [headers.join(','), ...dataRows].join('\n');
}

// ─── Utilities ───────────────────────────────────────────────────

export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface PsiMetrics {
  lcpMs: number | null;
  clsValue: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  siMs: number | null;
}

export function extractPsi(details: unknown): PsiMetrics {
  const empty: PsiMetrics = { lcpMs: null, clsValue: null, tbtMs: null, fcpMs: null, siMs: null };
  if (!details || typeof details !== 'object') return empty;
  const d = details as Record<string, unknown>;
  const psi = d.psi as Record<string, unknown> | undefined;
  if (!psi) return empty;
  return {
    lcpMs: typeof psi.lcpMs === 'number' ? psi.lcpMs : null,
    clsValue: typeof psi.clsValue === 'number' ? psi.clsValue : null,
    tbtMs: typeof psi.tbtMs === 'number' ? psi.tbtMs : null,
    fcpMs: typeof psi.fcpMs === 'number' ? psi.fcpMs : null,
    siMs: typeof psi.siMs === 'number' ? psi.siMs : null,
  };
}

export function slugify(domain: string): string {
  return domain
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildReportData(audit: {
  selectedSteps: number[];
  uraScoreU: number | null;
  uraScoreR: number | null;
  uraScoreA: number | null;
  uraScoreOverall: number | null;
  pages: {
    id: string;
    url: string;
    httpStatus: number | null;
    crawlDepth: number | null;
    performanceScore: number | null;
    inpValue: number | null;
    inpRating: string | null;
    mobileFriendly: boolean | null;
    accessibilityScore: number | null;
    domNodeCount: number | null;
    titleTag: string | null;
    titleLength: number | null;
    metaDescription: string | null;
    metaDescriptionLength: number | null;
    h1Count: number | null;
    wordCount: number | null;
    internalLinksInbound: number | null;
    internalLinksOutbound: number | null;
    decayBucket: string | null;
    eeatScore: number | null;
    hasAuthorByline: boolean | null;
    hasAuthorPage: boolean | null;
    hasSameAs: boolean | null;
    details: unknown;
  }[];
  issues: {
    id: string;
    stepNumber: number;
    severity: string;
    category: string;
    message: string;
    recommendation: string | null;
    auditPageId: string | null;
  }[];
}) {
  const pageUrlMap = new Map(audit.pages.map((p) => [p.id, p.url]));

  const pageData = audit.pages.map((p) => ({
    id: p.id,
    url: p.url,
    httpStatus: p.httpStatus,
    crawlDepth: p.crawlDepth,
    performanceScore: p.performanceScore,
    inpValue: p.inpValue,
    inpRating: p.inpRating,
    mobileFriendly: p.mobileFriendly,
    accessibilityScore: p.accessibilityScore,
    domNodeCount: p.domNodeCount,
    titleTag: p.titleTag,
    titleLength: p.titleLength,
    metaDescription: p.metaDescription,
    metaDescriptionLength: p.metaDescriptionLength,
    h1Count: p.h1Count,
    wordCount: p.wordCount,
    internalLinksInbound: p.internalLinksInbound,
    internalLinksOutbound: p.internalLinksOutbound,
    decayBucket: p.decayBucket,
    eeatScore: p.eeatScore,
    hasAuthorByline: p.hasAuthorByline,
    hasAuthorPage: p.hasAuthorPage,
    hasSameAs: p.hasSameAs,
    details: (p.details as Record<string, unknown>) ?? null,
  }));

  const issueData = audit.issues.map((i) => ({
    id: i.id,
    stepNumber: i.stepNumber,
    severity: i.severity,
    category: i.category,
    message: i.message,
    recommendation: i.recommendation,
    url: i.auditPageId ? (pageUrlMap.get(i.auditPageId) ?? null) : null,
  }));
  const selected = new Set(audit.selectedSteps);
  const filteredIssues = issueData.filter((issue) => selected.has(issue.stepNumber));

  return computeReportInsights(pageData, filteredIssues, {
    uraScoreU: audit.uraScoreU,
    uraScoreR: audit.uraScoreR,
    uraScoreA: audit.uraScoreA,
    uraScoreOverall: audit.uraScoreOverall,
  }, {
    selectedSteps: audit.selectedSteps,
  });
}

async function fetchAICitationEvidence(auditRunId: string) {
  const queries = await prisma.citationQuery.findMany({
    where: { auditRunId },
    orderBy: { createdAt: 'desc' },
    select: {
      queryText: true,
      seedKeyword: true,
      results: {
        orderBy: { createdAt: 'desc' },
        select: {
          platform: true,
          clientCited: true,
          citedDomains: true,
          competitorsCited: true,
          citationContext: true,
          gaps: {
            orderBy: { priority: 'desc' },
            select: {
              gapType: true,
              priority: true,
              recommendedAction: true,
            },
          },
        },
      },
    },
  });

  const rows = queries.flatMap((q) =>
    q.results.map((r) => ({
      queryText: q.queryText,
      seedKeyword: q.seedKeyword,
      platform: r.platform,
      clientCited: r.clientCited,
      citedDomains: Array.isArray(r.citedDomains)
        ? r.citedDomains.filter((d): d is string => typeof d === 'string')
        : [],
      competitorsCited: Array.isArray(r.competitorsCited)
        ? r.competitorsCited.filter((d): d is string => typeof d === 'string')
        : [],
      citationContext: r.citationContext ?? null,
      gapCount: r.gaps.length,
      topGapType: r.gaps[0]?.gapType ?? null,
      topGapPriority: r.gaps[0]?.priority ?? null,
      topGapAction: r.gaps[0]?.recommendedAction ?? null,
    }))
  );

  return {
    rows,
    summary: {
      attemptedQueries: queries.length,
      successfulQueries: rows.length,
      failedQueries: Math.max(0, queries.length - rows.length),
      confidenceScore: queries.length > 0 ? Math.round((rows.length / queries.length) * 100) : null,
    },
  };
}

async function fetchAICitationConfidenceHistory(userId: string, targetDomain: string) {
  const recentStep16Audits = await prisma.auditRun.findMany({
    where: {
      userId,
      targetDomain,
      status: 'COMPLETED',
      selectedSteps: { has: 16 },
    },
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      completedAt: true,
    },
    take: 12,
  });
  const auditIds = recentStep16Audits.map((a) => a.id);
  if (auditIds.length === 0) return [];

  const queries = await prisma.citationQuery.findMany({
    where: { auditRunId: { in: auditIds } },
    select: {
      auditRunId: true,
      results: { select: { id: true } },
    },
  });

  const byAudit = new Map<string, { attempted: number; successful: number }>();
  for (const query of queries) {
    const curr = byAudit.get(query.auditRunId) ?? { attempted: 0, successful: 0 };
    curr.attempted += 1;
    curr.successful += query.results.length;
    byAudit.set(query.auditRunId, curr);
  }

  return recentStep16Audits.map((run) => {
    const stat = byAudit.get(run.id) ?? { attempted: 0, successful: 0 };
    const failed = Math.max(0, stat.attempted - stat.successful);
    return {
      auditRunId: run.id,
      completedAt: run.completedAt?.toISOString() ?? null,
      attemptedQueries: stat.attempted,
      successfulQueries: stat.successful,
      failedQueries: failed,
      confidenceScore:
        stat.attempted > 0 ? Math.round((stat.successful / stat.attempted) * 100) : null,
    };
  });
}
