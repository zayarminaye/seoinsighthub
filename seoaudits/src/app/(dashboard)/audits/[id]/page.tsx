import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import AuditDetailClient from './AuditDetailClient';
import AuditReportClient from '@/components/report/AuditReportClient';
import { computeReportInsights } from '@/services/audit/reportInsights';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { getPlanTier } from '@/lib/planTiers';

type ConfidenceHistoryPoint = {
  auditRunId: string;
  completedAt: string | null;
  attemptedQueries: number;
  successfulQueries: number;
  confidenceScore: number | null;
};

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const audit = await prisma.auditRun.findUnique({
    where: { id, userId: user.id },
    include: {
      _count: { select: { pages: true, issues: true } },
    },
  });

  if (!audit) notFound();

  // ── Completed audit → comprehensive report ──
  if (audit.status === 'COMPLETED') {
    const allIssues = await prisma.auditIssue.findMany({
      where: { auditRunId: id },
      orderBy: [{ severity: 'asc' }, { stepNumber: 'asc' }],
      include: { auditPage: { select: { url: true } } },
    });

    const allPages = await prisma.auditPage.findMany({
      where: { auditRunId: id },
      orderBy: { performanceScore: 'asc' },
      select: {
        id: true,
        url: true,
        httpStatus: true,
        crawlDepth: true,
        performanceScore: true,
        inpValue: true,
        inpRating: true,
        mobileFriendly: true,
        accessibilityScore: true,
        domNodeCount: true,
        titleTag: true,
        titleLength: true,
        metaDescription: true,
        metaDescriptionLength: true,
        h1Count: true,
        wordCount: true,
        internalLinksInbound: true,
        internalLinksOutbound: true,
        decayBucket: true,
        eeatScore: true,
        hasAuthorByline: true,
        hasAuthorPage: true,
        hasSameAs: true,
        details: true,
      },
    });

    const issueData = allIssues.map((i) => ({
      id: i.id,
      stepNumber: i.stepNumber,
      severity: i.severity,
      category: i.category,
      message: i.message,
      recommendation: i.recommendation,
      url: i.auditPage?.url ?? null,
    }));

    const pageData = allPages.map((p) => ({
      id: p.id,
      url: p.url,
      httpStatus: p.httpStatus ?? null,
      crawlDepth: p.crawlDepth ?? null,
      performanceScore: p.performanceScore ?? null,
      inpValue: p.inpValue ?? null,
      inpRating: p.inpRating ?? null,
      mobileFriendly: p.mobileFriendly ?? null,
      accessibilityScore: p.accessibilityScore ?? null,
      domNodeCount: p.domNodeCount ?? null,
      titleTag: p.titleTag ?? null,
      titleLength: p.titleLength ?? null,
      metaDescription: p.metaDescription ?? null,
      metaDescriptionLength: p.metaDescriptionLength ?? null,
      h1Count: p.h1Count ?? null,
      wordCount: p.wordCount ?? null,
      internalLinksInbound: p.internalLinksInbound ?? null,
      internalLinksOutbound: p.internalLinksOutbound ?? null,
      decayBucket: p.decayBucket ?? null,
      eeatScore: p.eeatScore ?? null,
      hasAuthorByline: p.hasAuthorByline ?? null,
      hasAuthorPage: p.hasAuthorPage ?? null,
      hasSameAs: p.hasSameAs ?? null,
      details: (p.details as Record<string, unknown>) ?? null,
    }));

    const reportData = computeReportInsights(pageData, issueData, {
      uraScoreU: audit.uraScoreU,
      uraScoreR: audit.uraScoreR,
      uraScoreA: audit.uraScoreA,
      uraScoreOverall: audit.uraScoreOverall,
    }, {
      selectedSteps: audit.selectedSteps,
    });
    const [pdfFlag, csvFlag, jsonFlag, citationFlag] = await Promise.all([
      isFeatureEnabled('export.pdf', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
      isFeatureEnabled('export.csv', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
      isFeatureEnabled('export.json', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
      isFeatureEnabled('audit.citation-analysis', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
    ]);
    const citationQueries = await prisma.citationQuery.findMany({
      where: { auditRunId: id },
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
                competitorDomain: true,
                gapType: true,
                priority: true,
                recommendedAction: true,
              },
            },
          },
        },
      },
    });
    const aiCitationEvidence = citationQueries.flatMap((query) =>
      query.results.map((result) => ({
        queryText: query.queryText,
        seedKeyword: query.seedKeyword,
        platform: result.platform,
        clientCited: result.clientCited,
        citedDomains: Array.isArray(result.citedDomains)
          ? result.citedDomains.filter((d): d is string => typeof d === 'string')
          : [],
        competitorsCited: Array.isArray(result.competitorsCited)
          ? result.competitorsCited.filter((d): d is string => typeof d === 'string')
          : [],
        citationContext: result.citationContext ?? null,
        gaps: result.gaps.map((gap) => ({
          competitorDomain: gap.competitorDomain,
          gapType: gap.gapType,
          priority: gap.priority,
          recommendedAction: gap.recommendedAction ?? null,
        })),
      }))
    );
    const attemptedQueries = citationQueries.length;
    const successfulQueries = aiCitationEvidence.length;
    const failedQueries = Math.max(0, attemptedQueries - successfulQueries);
    const aiCitationConfidence =
      attemptedQueries > 0
        ? Math.round((successfulQueries / attemptedQueries) * 100)
        : null;
    const recentStep16Audits = await prisma.auditRun.findMany({
      where: {
        userId: user.id,
        targetDomain: audit.targetDomain,
        status: 'COMPLETED',
        selectedSteps: { has: 16 },
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        completedAt: true,
      },
      take: 8,
    });
    const recentIds = recentStep16Audits.map((a) => a.id);
    const recentQueries =
      recentIds.length > 0
        ? await prisma.citationQuery.findMany({
            where: { auditRunId: { in: recentIds } },
            select: {
              auditRunId: true,
              results: {
                select: {
                  id: true,
                },
              },
            },
          })
        : [];
    const queryStats = new Map<string, { attempted: number; successful: number }>();
    for (const q of recentQueries) {
      const current = queryStats.get(q.auditRunId) ?? { attempted: 0, successful: 0 };
      current.attempted += 1;
      current.successful += q.results.length;
      queryStats.set(q.auditRunId, current);
    }
    const aiCitationConfidenceHistory: ConfidenceHistoryPoint[] = recentStep16Audits.map((run) => {
      const stat = queryStats.get(run.id) ?? { attempted: 0, successful: 0 };
      return {
        auditRunId: run.id,
        completedAt: run.completedAt?.toISOString() ?? null,
        attemptedQueries: stat.attempted,
        successfulQueries: stat.successful,
        confidenceScore:
          stat.attempted > 0 ? Math.round((stat.successful / stat.attempted) * 100) : null,
      };
    });
    const tier = getPlanTier(user.plan);

    return (
      <AuditReportClient
        audit={{
          id: audit.id,
          targetDomain: audit.targetDomain,
          createdAt: audit.createdAt.toISOString(),
          completedAt: audit.completedAt?.toISOString() ?? null,
          pageCount: audit._count.pages,
          issueCount: audit._count.issues,
        }}
        report={reportData}
        canExportPdf={tier.pdfExport && pdfFlag}
        canExportCsv={tier.dataExport && csvFlag}
        canExportAiCsv={tier.dataExport && csvFlag && citationFlag}
        canExportAiHistoryCsv={tier.dataExport && csvFlag && citationFlag}
        canExportJson={tier.dataExport && jsonFlag}
        canRunCitationAnalysis={citationFlag}
        aiCitationEvidence={aiCitationEvidence}
        aiCitationConfidence={{
          attemptedQueries,
          successfulQueries,
          failedQueries,
          confidenceScore: aiCitationConfidence,
        }}
        aiCitationConfidenceHistory={aiCitationConfidenceHistory}
      />
    );
  }

  // ── In-progress / queued / failed → progress view ──
  const issues = await prisma.auditIssue.findMany({
    where: { auditRunId: id },
    orderBy: [{ severity: 'asc' }, { stepNumber: 'asc' }],
    include: { auditPage: { select: { url: true } } },
    take: 100,
  });

  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: id },
    orderBy: { performanceScore: 'asc' },
    select: {
      id: true,
      url: true,
      httpStatus: true,
      crawlDepth: true,
      performanceScore: true,
      inpValue: true,
      inpRating: true,
      mobileFriendly: true,
      accessibilityScore: true,
      domNodeCount: true,
    },
    take: 100,
  });

  return (
    <AuditDetailClient
      audit={{
        id: audit.id,
        targetDomain: audit.targetDomain,
        status: audit.status,
        totalPages: audit.totalPages,
        completedPages: audit.completedPages,
        currentStep: audit.currentStep,
        currentStepName: audit.currentStepName,
        uraScoreU: audit.uraScoreU,
        uraScoreR: audit.uraScoreR,
        uraScoreA: audit.uraScoreA,
        uraScoreOverall: audit.uraScoreOverall,
        createdAt: audit.createdAt.toISOString(),
        completedAt: audit.completedAt?.toISOString() ?? null,
        pageCount: audit._count.pages,
        issueCount: audit._count.issues,
      }}
      issues={issues.map((i) => ({
        id: i.id,
        stepNumber: i.stepNumber,
        severity: i.severity,
        category: i.category,
        message: i.message,
        recommendation: i.recommendation,
        url: i.auditPage?.url ?? null,
      }))}
      pages={pages.map((p) => ({
        ...p,
        performanceScore: p.performanceScore ?? null,
        inpValue: p.inpValue ?? null,
        inpRating: p.inpRating ?? null,
        mobileFriendly: p.mobileFriendly ?? null,
        accessibilityScore: p.accessibilityScore ?? null,
        domNodeCount: p.domNodeCount ?? null,
        crawlDepth: p.crawlDepth ?? null,
        httpStatus: p.httpStatus ?? null,
      }))}
    />
  );
}
