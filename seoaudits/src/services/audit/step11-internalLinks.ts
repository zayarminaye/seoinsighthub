import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

/**
 * Step 11: Internal Linking Analysis
 * Analyzes internal link structure using data collected during Step 1 crawl.
 * Identifies orphan pages, link distribution issues, and linking opportunities.
 */
export async function runStep11InternalLinks(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      internalLinksInbound: true,
      internalLinksOutbound: true,
      details: true,
    },
  });

  if (pages.length === 0) return;

  const issues: {
    auditRunId: string;
    auditPageId: string | null;
    stepNumber: number;
    severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
    category: string;
    message: string;
    recommendation: string;
  }[] = [];

  const totalPages = pages.length;

  // Compute site averages
  const inboundValues = pages
    .map((p) => p.internalLinksInbound)
    .filter((v): v is number => v !== null);

  const avgInbound = inboundValues.length > 0
    ? inboundValues.reduce((a, b) => a + b, 0) / inboundValues.length
    : 0;

  for (const page of pages) {
    const inbound = page.internalLinksInbound ?? 0;
    const outbound = page.internalLinksOutbound ?? 0;

    // ── Orphan pages (no internal links pointing to them) ──
    if (inbound === 0) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 11,
        severity: 'SERIOUS',
        category: 'Orphan Page',
        message: 'Page has zero internal links pointing to it. Search engines may not discover or prioritize it.',
        recommendation:
          'Add internal links from relevant pages to this URL. Orphan pages receive no PageRank internally and are unlikely to rank well.',
      });
    } else if (inbound === 1) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 11,
        severity: 'MODERATE',
        category: 'Low Internal Links',
        message: 'Page has only 1 internal link pointing to it. Important pages should have multiple internal links.',
        recommendation:
          'Add 2-3 more internal links from topically related pages. This distributes PageRank and helps search engines understand the page\'s importance.',
      });
    }

    // ── Pages with no outbound internal links ──────────────
    if (outbound === 0) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 11,
        severity: 'MODERATE',
        category: 'Dead-End Page',
        message: 'Page has no outbound internal links. It is a dead end for users and crawlers.',
        recommendation:
          'Add contextual links to related pages within the body content. This improves user navigation and distributes link equity.',
      });
    }

    // ── Excessive outbound links ───────────────────────────
    if (outbound > 100) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 11,
        severity: 'MODERATE',
        category: 'Excessive Links',
        message: `Page has ${outbound} internal links. Pages with too many links dilute the PageRank passed to each linked page.`,
        recommendation:
          'Reduce the number of links to focus on the most important pages. Consider consolidating navigation links and removing low-value links.',
      });
    }

    // ── Pages receiving disproportionately low links ───────
    if (inbound > 0 && avgInbound > 0 && inbound < avgInbound * 0.2 && totalPages > 10) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 11,
        severity: 'MINOR',
        category: 'Link Distribution',
        message: `Page receives ${inbound} internal link${inbound > 1 ? 's' : ''} vs site average of ${Math.round(avgInbound)}. Uneven link distribution can suppress ranking potential.`,
        recommendation:
          'Review internal linking strategy. Important pages should receive above-average internal links. Add contextual links from high-authority pages.',
      });
    }
  }

  // ── Site-level: overall link structure health ────────────
  const orphanCount = pages.filter((p) => (p.internalLinksInbound ?? 0) === 0).length;
  const deadEndCount = pages.filter((p) => (p.internalLinksOutbound ?? 0) === 0).length;

  if (orphanCount > 0 && totalPages > 5) {
    const orphanPct = Math.round((orphanCount / totalPages) * 100);
    if (orphanPct >= 20) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 11,
        severity: 'SERIOUS',
        category: 'Site Linking Structure',
        message: `${orphanPct}% of pages (${orphanCount}/${totalPages}) are orphan pages with no internal links. This indicates a weak internal linking structure.`,
        recommendation:
          'Implement a systematic internal linking strategy: add contextual links within content, use breadcrumb navigation, create hub pages for topic clusters, and ensure all pages are reachable within 3 clicks.',
      });
    }
  }

  if (deadEndCount > 0 && totalPages > 5) {
    const deadEndPct = Math.round((deadEndCount / totalPages) * 100);
    if (deadEndPct >= 30) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 11,
        severity: 'MODERATE',
        category: 'Dead-End Pages',
        message: `${deadEndPct}% of pages (${deadEndCount}/${totalPages}) are dead ends with no outbound internal links.`,
        recommendation:
          'Add "Related Articles" or "Next Steps" sections to content pages. Every page should link to at least 2-3 relevant internal pages.',
      });
    }
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
