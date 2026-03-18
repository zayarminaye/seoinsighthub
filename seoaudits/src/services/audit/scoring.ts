import { prisma } from '@/lib/prisma';

interface URAScores {
  uraScoreU: number | null;
  uraScoreR: number | null;
  uraScoreA: number | null;
  uraScoreOverall: number | null;
}

/**
 * Calculate URA composite scores for an audit run.
 *
 * Usability (Steps 1-7):
 *   Page Speed 25% + INP 20% + Crawlability 15% + Mobile 15%
 *   + Crawl Depth 10% + Security 10% + Accessibility 5%
 *
 * Relevance (Steps 8-14):
 *   Title & Meta 25% + Headings 15% + Content Depth 20%
 *   + Internal Linking 15% + Content Freshness 10%
 *   + Schema 10% + Images 5%
 *
 * Authority (Steps 15-18):
 *   E-E-A-T 35% + Backlink Quality 25% + AI Citation Readiness 20%
 *   + Brand Signals 20%
 */
export async function calculateURAScores(auditRunId: string): Promise<URAScores> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId },
    select: {
      performanceScore: true,
      inpValue: true,
      mobileFriendly: true,
      accessibilityScore: true,
      crawlDepth: true,
      domNodeCount: true,
      httpStatus: true,
      titleTag: true,
      titleLength: true,
      metaDescription: true,
      metaDescriptionLength: true,
      h1Count: true,
      wordCount: true,
      internalLinksInbound: true,
      internalLinksOutbound: true,
      decayBucket: true,
      hasSameAs: true,
      eeatScore: true,
      hasAuthorByline: true,
      hasAuthorPage: true,
    },
  });

  if (pages.length === 0) {
    return { uraScoreU: null, uraScoreR: null, uraScoreA: null, uraScoreOverall: null };
  }

  // ═══════════════════════════════════════════════════════════
  // USABILITY (Steps 1-7)
  // ═══════════════════════════════════════════════════════════

  // Page Speed component (25%)
  const perfScores = pages
    .map((p) => p.performanceScore)
    .filter((s): s is number => s !== null);
  const avgPerf =
    perfScores.length > 0
      ? perfScores.reduce((a, b) => a + b, 0) / perfScores.length
      : null;

  // INP component (20%) — convert ms to 0-100 score
  const inpValues = pages
    .map((p) => p.inpValue)
    .filter((v): v is number => v !== null);
  const avgInpScore =
    inpValues.length > 0
      ? inpValues
          .map((ms): number => {
            if (ms < 200) return 100;
            if (ms < 500) return 50;
            return 0;
          })
          .reduce((a, b) => a + b, 0) / inpValues.length
      : null;

  // Crawlability component (15%)
  const crawlablePages = pages.filter(
    (p) => p.httpStatus !== null && p.httpStatus >= 200 && p.httpStatus < 400
  );
  const domOkPages = pages.filter(
    (p) => p.domNodeCount === null || p.domNodeCount <= 1400
  );
  const crawlabilityScore =
    pages.length > 0
      ? ((crawlablePages.length / pages.length) * 50 +
         (domOkPages.length / pages.length) * 50)
      : null;

  // Mobile component (15%)
  const mobileValues = pages
    .map((p) => p.mobileFriendly)
    .filter((v): v is boolean => v !== null);
  const mobileScore =
    mobileValues.length > 0
      ? (mobileValues.filter(Boolean).length / mobileValues.length) * 100
      : null;

  // Crawl Depth component (10%)
  const depthValues = pages
    .map((p) => p.crawlDepth)
    .filter((v): v is number => v !== null);
  const depthScore =
    depthValues.length > 0
      ? (depthValues.filter((d) => d <= 3).length / depthValues.length) * 100
      : null;

  // Security component (10%)
  const securityIssues = await prisma.auditIssue.count({
    where: { auditRunId, stepNumber: 6 },
  });
  const securityScore = Math.max(0, 100 - securityIssues * 15);

  // Accessibility component (5%)
  const a11yScores = pages
    .map((p) => p.accessibilityScore)
    .filter((s): s is number => s !== null);
  const avgA11y =
    a11yScores.length > 0
      ? a11yScores.reduce((a, b) => a + b, 0) / a11yScores.length
      : null;

  const uraScoreU = weightedAverage([
    [avgPerf, 0.25],
    [avgInpScore, 0.20],
    [crawlabilityScore, 0.15],
    [mobileScore, 0.15],
    [depthScore, 0.10],
    [securityScore, 0.10],
    [avgA11y, 0.05],
  ]);

  // ═══════════════════════════════════════════════════════════
  // RELEVANCE (Steps 8-14)
  // ═══════════════════════════════════════════════════════════

  // Title & Meta component (25%) — % of pages with good title + meta desc
  const titleOk = pages.filter(
    (p) =>
      p.titleTag !== null &&
      p.titleTag.trim().length > 0 &&
      (p.titleLength ?? p.titleTag.length) >= 30 &&
      (p.titleLength ?? p.titleTag.length) <= 60
  );
  const metaOk = pages.filter(
    (p) =>
      p.metaDescription !== null &&
      p.metaDescription.trim().length > 0 &&
      (p.metaDescriptionLength ?? p.metaDescription.length) >= 120 &&
      (p.metaDescriptionLength ?? p.metaDescription.length) <= 160
  );
  const titleMetaScore =
    pages.length > 0
      ? ((titleOk.length / pages.length) * 50 +
         (metaOk.length / pages.length) * 50)
      : null;

  // Headings component (15%) — % of pages with exactly 1 H1
  const headingOk = pages.filter((p) => p.h1Count === 1);
  const headingScore =
    pages.length > 0
      ? (headingOk.length / pages.length) * 100
      : null;

  // Content Depth component (20%) — % of pages with 300+ words
  const wordCounts = pages
    .map((p) => p.wordCount)
    .filter((v): v is number => v !== null);
  const contentDepthScore =
    wordCounts.length > 0
      ? (wordCounts.filter((w) => w >= 300).length / wordCounts.length) * 100
      : null;

  // Internal Linking component (15%) — % of non-orphan pages
  const linkedPages = pages.filter(
    (p) => p.internalLinksInbound !== null && p.internalLinksInbound > 0
  );
  const pagesWithLinkData = pages.filter(
    (p) => p.internalLinksInbound !== null
  );
  const internalLinkScore =
    pagesWithLinkData.length > 0
      ? (linkedPages.length / pagesWithLinkData.length) * 100
      : null;

  // Content Freshness component (10%) — % of pages that are HEALTHY
  const pagesWithDecay = pages.filter((p) => p.decayBucket !== null);
  const healthyPages = pagesWithDecay.filter((p) => p.decayBucket === 'HEALTHY');
  const freshnessScore =
    pagesWithDecay.length > 0
      ? (healthyPages.length / pagesWithDecay.length) * 100
      : null;

  // Schema component (10%) — derived from step 13 issues
  const schemaIssues = await prisma.auditIssue.count({
    where: { auditRunId, stepNumber: 13 },
  });
  const schemaScore = Math.max(0, 100 - schemaIssues * 10);

  // Images component (5%) — derived from step 14 issues
  const imageIssues = await prisma.auditIssue.count({
    where: { auditRunId, stepNumber: 14 },
  });
  const imageScore = Math.max(0, 100 - imageIssues * 8);

  const uraScoreR = weightedAverage([
    [titleMetaScore, 0.25],
    [headingScore, 0.15],
    [contentDepthScore, 0.20],
    [internalLinkScore, 0.15],
    [freshnessScore, 0.10],
    [schemaScore, 0.10],
    [imageScore, 0.05],
  ]);

  // ═══════════════════════════════════════════════════════════
  // AUTHORITY (Steps 15-18)
  // ═══════════════════════════════════════════════════════════

  // E-E-A-T component (35%) — average eeatScore across pages
  const eeatScores = pages
    .map((p) => p.eeatScore)
    .filter((s): s is number => s !== null);
  const avgEeat =
    eeatScores.length > 0
      ? eeatScores.reduce((a, b) => a + b, 0) / eeatScores.length
      : null;

  // Backlink Quality component (25%) — derived from step 15 issues
  const backlinkIssues = await prisma.auditIssue.count({
    where: { auditRunId, stepNumber: 15 },
  });
  const backlinkScore = Math.max(0, 100 - backlinkIssues * 12);

  // AI Citation Readiness component (20%) — derived from step 16 issues
  const aiCitationIssues = await prisma.auditIssue.count({
    where: { auditRunId, stepNumber: 16 },
  });
  const aiCitationScore = Math.max(0, 100 - aiCitationIssues * 15);

  // Brand Signals component (20%) — derived from step 18 issues
  const brandIssues = await prisma.auditIssue.count({
    where: { auditRunId, stepNumber: 18 },
  });
  const brandScore = Math.max(0, 100 - brandIssues * 12);

  const uraScoreA = weightedAverage([
    [avgEeat, 0.35],
    [backlinkScore, 0.25],
    [aiCitationScore, 0.20],
    [brandScore, 0.20],
  ]);

  // ═══════════════════════════════════════════════════════════
  // OVERALL = U(35%) + R(35%) + A(30%)
  // ═══════════════════════════════════════════════════════════
  const uraScoreOverall = weightedAverage([
    [uraScoreU, 0.35],
    [uraScoreR, 0.35],
    [uraScoreA, 0.30],
  ]);

  return { uraScoreU, uraScoreR, uraScoreA, uraScoreOverall };
}

/**
 * Compute weighted average, skipping null components
 * and normalizing weights to available components.
 */
function weightedAverage(components: [number | null, number][]): number | null {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [score, weight] of components) {
    if (score !== null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}
