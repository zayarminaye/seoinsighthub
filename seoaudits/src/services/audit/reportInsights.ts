import { STEP_NAMES } from '../queue/config';

// ─── Input types (matching Prisma select shapes) ───────────────

export interface ReportPageInput {
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
  details: Record<string, unknown> | null;
}

export interface ReportIssueInput {
  id: string;
  stepNumber: number;
  severity: string;
  category: string;
  message: string;
  recommendation: string | null;
  url: string | null;
}

// ─── Output types (serializable, passed as client props) ────────

export interface ReportData {
  executive: ExecutiveSummary;
  scoreBreakdown: ScoreBreakdown;
  priorityActions: PriorityAction[];
  stepInsights: StepInsight[];
  worstPerformers: WorstPerformer[];
  issues: ReportIssueInput[];
  pages: ReportPageInput[];
}

export interface ExecutiveSummary {
  overallScore: number | null;
  grade: string;
  gradeColor: 'green' | 'yellow' | 'red';
  verdict: string;
  pagesAudited: number;
  totalIssues: number;
  criticalCount: number;
  seriousCount: number;
  topActions: TopAction[];
}

export interface TopAction {
  title: string;
  reason: string;
  affectedPages: number;
  severity: string;
}

export interface ScoreBreakdown {
  usabilityScore: number | null;
  relevanceScore: number | null;
  authorityScore: number | null;
  components: ScoreComponent[];
}

export interface ScoreComponent {
  name: string;
  weight: number;
  weightLabel: string;
  score: number | null;
  benchmark: string;
  status: 'good' | 'warning' | 'poor';
  insight: string;
}

export interface PriorityAction {
  category: string;
  group: 'critical-fixes' | 'quick-wins';
  severity: string;
  impactScore: number;
  problem: string;
  whyItMatters: string;
  howToFix: string;
  affectedPageCount: number;
  sampleUrls: string[];
}

export interface StepInsight {
  stepNumber: number;
  stepName: string;
  passCount: number;
  failCount: number;
  totalRelevant: number;
  passRate: number;
  status: 'good' | 'warning' | 'poor';
  keyMetric: {
    label: string;
    value: string;
    benchmark: string;
    status: 'good' | 'warning' | 'poor';
  } | null;
  positiveSignals: string[];
  issues: ReportIssueInput[];
}

export interface WorstPerformer {
  url: string;
  issueCount: number;
  criticalCount: number;
  seriousCount: number;
  failedSteps: { stepNumber: number; stepName: string }[];
  performanceScore: number | null;
  accessibilityScore: number | null;
}

// ─── Constants ──────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 4,
  SERIOUS: 3,
  MODERATE: 2,
  MINOR: 1,
};

const NON_SCORING_ISSUE_CATEGORIES = new Set([
  'AI Analysis Disclaimer',
  'AI Model Processing Notice',
  'AI Model Quota Exceeded',
  'AI Citation Data Notice',
  'AI Query Budget Applied',
]);

const GRADE_MAP: { min: number; grade: string; color: 'green' | 'yellow' | 'red' }[] = [
  { min: 90, grade: 'A', color: 'green' },
  { min: 80, grade: 'B', color: 'green' },
  { min: 65, grade: 'C', color: 'yellow' },
  { min: 50, grade: 'D', color: 'yellow' },
  { min: 0, grade: 'F', color: 'red' },
];

const CATEGORY_IMPACT: Record<string, string> = {
  'Page Speed': 'Google uses Core Web Vitals as a ranking signal. Pages scoring below 50 have significantly higher bounce rates — Google research shows a 123% increase in bounce probability when load time goes from 1s to 10s.',
  'LCP': 'Largest Contentful Paint is a Core Web Vital and a direct Google ranking signal. The LCP element (usually a hero image or main heading) must render within 2.5s for a "good" rating. LCP directly affects perceived load speed.',
  'CLS': 'Cumulative Layout Shift is a Core Web Vital ranking signal. Unexpected layout shifts frustrate users and can cause accidental clicks. Google measures CLS over the entire page lifetime, not just initial load.',
  'INP': 'Interaction to Next Paint replaced FID as a Core Web Vital in March 2024. It measures end-to-end responsiveness of user interactions (click, tap, keyboard). Poor INP means the page feels sluggish even after loading.',
  'TBT': 'Total Blocking Time is a Lighthouse diagnostic metric that strongly correlates with INP. While not a direct ranking factor, high TBT (> 300ms) indicates the main thread is blocked by long JavaScript tasks, degrading interactivity.',
  'HTTP Status': 'Broken pages (4xx/5xx) waste Googlebot\'s crawl budget — the limited number of pages Google will crawl per visit. Each broken URL is a dead end for both users and link equity flow.',
  'Indexability': 'Noindexed pages are completely excluded from Google\'s search index. If revenue-generating pages are accidentally noindexed, they receive zero organic traffic. Verify noindex is intentional on each flagged page.',
  'DOM Size': 'Large DOM trees (3,000+ nodes) slow browser rendering, increase memory usage, and degrade Core Web Vitals — particularly INP and LCP. Google\'s rendering engine also has finite resources per page.',
  'Canonicalization': 'Without canonical tags, Google must guess which URL version to index when duplicates exist (trailing slashes, query parameters, HTTP/HTTPS variants). This dilutes ranking signals across duplicate URLs.',
  'Orphan Page': 'Pages with zero internal links pointing to them are invisible to crawlers that follow links. Googlebot may never discover orphan pages, and they receive no internal PageRank equity.',
  'Crawl Depth': 'Pages more than 3 clicks from the homepage receive less crawl frequency and less internal PageRank. Google interprets deep pages as less important. Move critical content closer to the homepage.',
  'Viewport': 'Since Google\'s mobile-first indexing (2023), the mobile version of your page is what gets indexed and ranked. Without a viewport meta tag, mobile rendering fails entirely, resulting in a poor mobile experience and lower rankings.',
  'Content Width': 'Content wider than the mobile viewport triggers horizontal scrolling, which fails Google\'s mobile-friendly test. This is a binary pass/fail signal that directly impacts mobile search rankings.',
  'Tap Targets': 'Interactive elements smaller than 48x48 CSS pixels (per WCAG 2.5.5 and Google\'s guidelines) cause accidental taps on mobile. Google flags this in Search Console as a mobile usability issue.',
  'Font Size': 'Text below 14px on mobile forces users to pinch-to-zoom, a negative UX signal. Google\'s mobile-friendly test flags illegible text, and poor readability increases bounce rates.',
  'HTTPS': 'HTTPS has been a confirmed Google ranking signal since 2014. Chrome marks HTTP pages as "Not Secure" in the address bar, which erodes user trust and increases bounce rates.',
  'HSTS': 'Without Strict-Transport-Security, browsers may connect over insecure HTTP before redirecting. HSTS with preload ensures all connections use HTTPS from the first request, eliminating man-in-the-middle vulnerability windows.',
  'CSP': 'Content-Security-Policy prevents XSS attacks by controlling which scripts can execute. While not a direct ranking factor, XSS-compromised sites can be flagged as dangerous by Google Safe Browsing, devastating organic traffic.',
  'Security Headers': 'Missing security headers expose the site to various attack vectors. Compromised sites get flagged by Google Safe Browsing, showing warning interstitials that block 95%+ of traffic until the issue is resolved.',
  'HTTPS Redirect': 'HTTPS pages redirecting to HTTP defeat encryption, exposing user data and session tokens. This is a critical security flaw that also confuses search engines about the canonical protocol.',
  'Accessibility': 'WCAG 2.1 AA compliance improves usability for all users, not just those with disabilities. Accessible sites tend to have better HTML structure, which helps search engines understand content. Many accessibility issues (missing alt text, poor heading hierarchy) also hurt SEO.',
  'AI Bot Access': 'Blocking AI crawlers (GPTBot, PerplexityBot, etc.) prevents your content from appearing in AI-generated answers and citations. As AI search grows, this impacts a growing share of discovery traffic.',
  // Relevance categories (Steps 8-14)
  'Title Tag': 'The title tag is the single most important on-page ranking element. It appears as the clickable headline in search results and directly influences both rankings and click-through rate. A missing or poorly optimized title means lost organic traffic.',
  'Duplicate Title': 'Duplicate titles signal to Google that pages may contain duplicate content. This dilutes ranking potential across competing pages and reduces click-through rates because search results look identical.',
  'Meta Description': 'While not a direct ranking factor, meta descriptions are your ad copy in search results. Pages with compelling descriptions get up to 5.8% higher click-through rates (Backlinko study), which indirectly improves rankings.',
  'H1 Tag': 'The H1 heading is the most important on-page heading signal. Google uses it to understand page topic. Missing or multiple H1s weaken the topical focus signal and confuse the document hierarchy.',
  'H1 Prominence': 'Visual heading hierarchy should match semantic hierarchy. When an H2 or H3 is visually larger than the H1, it sends mixed signals about content importance to both users and search engines.',
  'Heading Hierarchy': 'A logical heading structure (H1 → H2 → H3) creates a clear document outline. Screen readers, search engines, and AI systems all use this hierarchy to understand content structure and topical relationships.',
  'Empty Headings': 'Empty heading tags create noise in the document outline and confuse assistive technology. They waste semantic structure that could be reinforcing content relevance signals.',
  'Thin Content': 'Pages with fewer than 300 words are considered thin content by Google\'s Helpful Content system (introduced August 2022, updated March 2024). Thin pages struggle to demonstrate expertise and rarely rank for competitive queries.',
  'Keyword Placement': 'Keywords in the title tag and H1 carry the strongest on-page relevance signal. Google\'s own SEO Starter Guide emphasizes that titles and headings should reflect page content. Misalignment between content and title/H1 weakens ranking potential.',
  'Keyword Stuffing': 'Google\'s SpamBrain algorithm detects and penalizes keyword stuffing. Unnatural keyword density (> 3%) can trigger algorithmic demotion. Modern SEO favors natural language and semantic variations.',
  'Title-Content Alignment': 'When the title tag doesn\'t reflect the page\'s primary content, it creates a relevance mismatch. Google may rewrite the title in search results, and users who click may bounce, both hurting rankings.',
  'Low Internal Links': 'Pages with very few internal links receive less PageRank and less crawl priority. Google interprets sparse linking as a signal that the page is not important within the site.',
  'Dead-End Page': 'Pages with no outbound internal links trap users and PageRank. They prevent users from navigating deeper and block link equity from flowing to other important pages.',
  'Excessive Links': 'Pages with 100+ links dilute the PageRank value passed to each linked page. Google\'s original PageRank formula divides link equity equally among all outbound links.',
  'Link Distribution': 'Uneven internal link distribution causes some pages to accumulate PageRank while others are starved. Important pages should receive above-average internal links.',
  'Site Linking Structure': 'A weak overall internal linking structure is one of the most common technical SEO issues. It affects crawl efficiency, PageRank distribution, and topical relevance signals.',
  'Content Decay': 'Content that hasn\'t been updated in over 2 years is at high risk of ranking decline. Google\'s Helpful Content system (March 2024 update) favors content that demonstrates ongoing maintenance and accuracy.',
  'Content Freshness': 'Google\'s Query Deserves Freshness (QDF) algorithm boosts recently updated content for time-sensitive queries. Even for evergreen topics, periodic updates signal ongoing relevance and accuracy.',
  'Last-Modified Header': 'The Last-Modified header enables conditional HTTP requests (If-Modified-Since), reducing bandwidth and server load. It also helps search engines understand when content was last changed.',
  'Missing Schema': 'JSON-LD structured data enables rich results (stars, FAQs, breadcrumbs, prices) in Google search. Pages with rich results get 58% higher click-through rates compared to plain blue links (Search Engine Land).',
  'Organization Schema': 'Organization schema is essential for Google Knowledge Panel eligibility. It links your brand to social profiles, logo, and contact information, building entity authority.',
  'Breadcrumb Schema': 'BreadcrumbList schema replaces the URL in search results with a readable path hierarchy. This is one of the easiest rich results to earn and improves both click-through rate and user orientation.',
  'Missing Alt Text': 'Image alt text is required for WCAG 1.1.1 accessibility compliance and is the primary signal Google uses for image search ranking. Images without alt text miss both accessibility and image SEO opportunities.',
  'Image Dimensions': 'Images without explicit width/height attributes cause Cumulative Layout Shift (CLS), a Core Web Vital ranking signal. Reserving space prevents the page from jumping as images load.',
  'Image Format': 'WebP images are 25-34% smaller than JPEG at equivalent quality (Google research). AVIF offers 50% savings. Switching reduces page weight, improves LCP, and directly impacts Core Web Vitals scores.',
  'Oversized Images': 'Serving images larger than their display size wastes bandwidth and slows page load. A 2000px image displayed at 400px transfers 25x more data than necessary.',
  'Lazy Loading': 'Above-fold images with loading="lazy" delay the LCP element, directly hurting the Core Web Vital score. Below-fold images without lazy-load waste bandwidth on content users may never see.',
  'Alt Text Coverage': 'A site with 30%+ missing alt text has systemic accessibility and SEO gaps. This indicates images are being added without considering accessibility or search visibility.',
  'Image Modernization': 'Sites with 50%+ legacy format images have significant optimization potential. CDN-based automatic format conversion (Cloudflare, Cloudinary) is the most efficient solution.',
  // Authority categories (Steps 15-18)
  'Excessive External Links': 'Too many outbound links dilute page authority and can appear spammy. Google\'s original PageRank formula divides link equity across all outbound links.',
  'Nofollow Overuse': 'Excessive nofollow usage prevents your site from passing any link equity to cited sources. Natural editorial linking (dofollow) to authoritative references builds topical authority.',
  'Empty Link Anchors': 'Descriptive anchor text helps search engines understand link context and relevance. Empty anchors miss this opportunity and provide poor user experience.',
  'Missing Social Profiles': 'Social profile links (sameAs) in structured data help Google connect your brand across platforms, enabling Knowledge Panel creation and entity disambiguation.',
  'No External References': 'Citing authoritative external sources demonstrates expertise and builds topical associations. Sites that never link out appear isolated and less trustworthy to both users and algorithms.',
  'High Nofollow Ratio': 'A high nofollow ratio suggests a reluctance to endorse any external content. Natural editorial linking patterns include both dofollow and nofollow links.',
  'Low External Citation Rate': 'Pages that cite authoritative sources tend to rank better. Outbound links to high-quality references demonstrate research depth and topical expertise.',
  'AI Bot Blocked': 'Blocking AI crawlers prevents your content from appearing in AI-generated search results. As AI-powered search (Google AI Overview, Perplexity) grows, this increasingly impacts traffic.',
  'Missing FAQ Schema': 'FAQ structured data is one of the most cited content formats by AI search systems. FAQPage schema enables rich results and provides clear Q&A pairs that AI can extract.',
  'Low Citation Potential': 'Thin content pages (< 300 words) are rarely cited by AI systems because they lack sufficient depth to serve as authoritative sources.',
  'Unstructured Content': 'AI systems prefer well-structured content with lists, headings, and clear formatting. Unstructured text walls are harder to parse and less likely to be cited.',
  'Poor Content Structure': 'Long content without heading structure is difficult for AI systems to segment and cite. Clear H2/H3 sections help AI extract relevant passages.',
  'Missing Author Byline': 'Author attribution is a key E-E-A-T signal. Google\'s Quality Rater Guidelines emphasize author expertise, especially for YMYL (Your Money Your Life) content.',
  'No Author Attribution': 'Lack of any author attribution across the site signals low editorial standards. Google increasingly values identifiable, expert authors for content quality assessment.',
  'Low Author Attribution': 'Inconsistent author attribution weakens the site\'s overall E-E-A-T signals. All content pages should credit their authors with links to bio pages.',
  'Missing Publication Date': 'Publication and update dates help search engines assess content freshness. Undated content may be perceived as stale or less reliable.',
  'No Content Dates': 'Absence of dates on content pages prevents users and search engines from assessing timeliness and relevance.',
  'Missing About Page': 'An About page is critical for establishing E-E-A-T. Google\'s Quality Rater Guidelines specifically look for information about who creates the content and why they are qualified.',
  'Missing Contact Page': 'Contact information is a basic trust signal. Google expects legitimate businesses to provide ways to get in touch, especially for YMYL sites.',
  'Missing Privacy Policy': 'Privacy policies are expected by users and legally required in many jurisdictions (GDPR, CCPA). Their absence signals low professionalism.',
  'Missing Terms of Service': 'Terms of Service pages add professionalism and establish legal frameworks for site usage.',
  'Missing Organization Schema': 'Organization schema is essential for Google Knowledge Panel eligibility and helps search engines understand your brand entity.',
  'Incomplete Organization Schema': 'Incomplete Organization schema misses opportunities to provide logo, contact information, and social profile signals that strengthen your brand entity.',
  'Missing Social Profiles in Schema': 'Social profiles in Organization schema sameAs property help Google verify your brand across platforms and build your Knowledge Panel.',
  'Missing Contact in Schema': 'contactPoint in Organization schema provides structured contact information that Google can use for rich results and Knowledge Panel display.',
  'Brand Name Missing from Titles': 'Consistent brand presence in title tags reinforces brand recognition in search results and helps establish branded search associations.',
  'Inconsistent Brand in Titles': 'Inconsistent title tag formatting weakens brand recognition. A unified format like "Page Title | Brand" builds cohesive brand identity in SERPs.',
  'No Social Profile Links': 'Social media profiles are trust signals that help establish brand legitimacy. They also provide additional channels for brand discovery.',
  'Limited Social Presence': 'Limited social platform presence reduces opportunities for brand discovery and cross-platform authority signals.',
  'Missing OpenGraph Tags': 'OpenGraph tags control how your brand appears when shared on social media. Missing og:image results in generic link previews that get fewer clicks.',
};

function getStatus(score: number | null): 'good' | 'warning' | 'poor' {
  if (score === null) return 'poor';
  if (score >= 80) return 'good';
  if (score >= 50) return 'warning';
  return 'poor';
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

// ─── Main entry point ───────────────────────────────────────────

export function computeReportInsights(
  pages: ReportPageInput[],
  issues: ReportIssueInput[],
  auditScores: {
    uraScoreU: number | null;
    uraScoreR: number | null;
    uraScoreA: number | null;
    uraScoreOverall: number | null;
  },
  options?: {
    selectedSteps?: number[];
  }
): ReportData {
  const scoreBreakdown = computeScoreBreakdown(pages, issues);
  const executive = computeExecutive(pages, issues, auditScores.uraScoreOverall);
  const priorityActions = computePriorityActions(issues);
  const stepInsights = computeStepInsights(pages, issues, options?.selectedSteps);
  const worstPerformers = computeWorstPerformers(pages, issues);

  return {
    executive,
    scoreBreakdown,
    priorityActions,
    stepInsights,
    worstPerformers,
    issues,
    pages,
  };
}

// ─── Executive Summary ──────────────────────────────────────────

function computeExecutive(
  pages: ReportPageInput[],
  issues: ReportIssueInput[],
  overallScore: number | null
): ExecutiveSummary {
  const gradeEntry = GRADE_MAP.find((g) => (overallScore ?? 0) >= g.min) ?? GRADE_MAP[GRADE_MAP.length - 1];

  const criticalCount = issues.filter((i) => i.severity === 'CRITICAL').length;
  const seriousCount = issues.filter((i) => i.severity === 'SERIOUS').length;

  // Find top issue category
  const categoryCounts = new Map<string, number>();
  for (const issue of issues) {
    if (issue.severity === 'CRITICAL' || issue.severity === 'SERIOUS') {
      categoryCounts.set(issue.category, (categoryCounts.get(issue.category) ?? 0) + 1);
    }
  }
  const topCategory = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  // Generate verdict
  const score = overallScore ?? 0;
  let verdict: string;
  if (score >= 90 && criticalCount === 0) {
    verdict = 'Excellent. Your site scores well across all usability checks with no critical issues.';
  } else if (score >= 80) {
    verdict = criticalCount > 0
      ? `Strong overall performance, but ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} in ${topCategory} should be addressed promptly.`
      : 'Good usability fundamentals. Focus on the recommendations below to push scores higher.';
  } else if (score >= 65) {
    verdict = criticalCount > 0
      ? `Decent fundamentals, but ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} — primarily in ${topCategory} — are holding your site back.`
      : `Room for improvement. ${seriousCount} serious issue${seriousCount > 1 ? 's' : ''} across ${topCategory} need attention.`;
  } else if (score >= 50) {
    verdict = `Below average usability. ${criticalCount} critical and ${seriousCount} serious issues require attention, especially in ${topCategory}.`;
  } else {
    verdict = `Significant usability problems found. ${criticalCount} critical and ${seriousCount} serious issues require immediate attention${topCategory ? `, especially in ${topCategory}` : ''}.`;
  }

  // Top 3 actions: group by category, rank by impact
  const topActions = computeTopActions(issues);

  return {
    overallScore,
    grade: gradeEntry.grade,
    gradeColor: gradeEntry.color,
    verdict,
    pagesAudited: pages.length,
    totalIssues: issues.length,
    criticalCount,
    seriousCount,
    topActions,
  };
}

function computeTopActions(issues: ReportIssueInput[]): TopAction[] {
  const categoryMap = new Map<string, { urls: Set<string>; maxSeverity: string; messages: string[] }>();

  for (const issue of issues) {
    let entry = categoryMap.get(issue.category);
    if (!entry) {
      entry = { urls: new Set(), maxSeverity: 'MINOR', messages: [] };
      categoryMap.set(issue.category, entry);
    }
    if (issue.url) entry.urls.add(issue.url);
    if ((SEVERITY_WEIGHT[issue.severity] ?? 0) > (SEVERITY_WEIGHT[entry.maxSeverity] ?? 0)) {
      entry.maxSeverity = issue.severity;
    }
    if (entry.messages.length < 3) entry.messages.push(issue.message);
  }

  return [...categoryMap.entries()]
    .map(([category, data]) => ({
      title: `Fix ${category} issues`,
      reason: `${data.urls.size} page${data.urls.size > 1 ? 's' : ''} affected. ${data.messages[0]}`,
      affectedPages: data.urls.size,
      severity: data.maxSeverity,
    }))
    .sort((a, b) => {
      const scoreA = (SEVERITY_WEIGHT[a.severity] ?? 0) * a.affectedPages;
      const scoreB = (SEVERITY_WEIGHT[b.severity] ?? 0) * b.affectedPages;
      return scoreB - scoreA;
    })
    .slice(0, 3);
}

// ─── Score Breakdown ────────────────────────────────────────────

function computeScoreBreakdown(
  pages: ReportPageInput[],
  issues: ReportIssueInput[]
): ScoreBreakdown {
  if (pages.length === 0) {
    return { usabilityScore: null, relevanceScore: null, authorityScore: null, components: [] };
  }

  // Page Speed (25%)
  const perfScores = pages.map((p) => p.performanceScore).filter((s): s is number => s !== null);
  const avgPerf = avg(perfScores);
  const poorPerfCount = perfScores.filter((s) => s < 50).length;

  // INP (20%)
  const inpValues = pages.map((p) => p.inpValue).filter((v): v is number => v !== null);
  const inpScores = inpValues.map((ms) => (ms < 200 ? 100 : ms < 500 ? 50 : 0));
  const avgInpScore = avg(inpScores);
  const goodInpCount = inpValues.filter((ms) => ms < 200).length;

  // Crawlability (15%)
  const httpOkCount = pages.filter(
    (p) => p.httpStatus !== null && p.httpStatus >= 200 && p.httpStatus < 400
  ).length;
  const domOkCount = pages.filter(
    (p) => p.domNodeCount === null || p.domNodeCount <= 1400
  ).length;
  const crawlabilityScore =
    (httpOkCount / pages.length) * 50 + (domOkCount / pages.length) * 50;

  // Mobile (15%)
  const mobileValues = pages.map((p) => p.mobileFriendly).filter((v): v is boolean => v !== null);
  const mobilePassCount = mobileValues.filter(Boolean).length;
  const mobileScore = mobileValues.length > 0 ? (mobilePassCount / mobileValues.length) * 100 : null;

  // Crawl Depth (10%)
  const depthValues = pages.map((p) => p.crawlDepth).filter((v): v is number => v !== null);
  const depthOkCount = depthValues.filter((d) => d <= 3).length;
  const depthScore = depthValues.length > 0 ? (depthOkCount / depthValues.length) * 100 : null;

  // Security (10%)
  const step6Issues = issues.filter((i) => i.stepNumber === 6).length;
  const securityScore = Math.max(0, 100 - step6Issues * 15);

  // Accessibility (5%)
  const a11yScores = pages.map((p) => p.accessibilityScore).filter((s): s is number => s !== null);
  const avgA11y = avg(a11yScores);

  const components: ScoreComponent[] = [
    {
      name: 'Page Speed',
      weight: 0.25,
      weightLabel: '25%',
      score: avgPerf !== null ? Math.round(avgPerf) : null,
      benchmark: 'Google Lighthouse recommends 90+',
      status: getStatus(avgPerf),
      insight: avgPerf !== null
        ? avgPerf >= 80
          ? `Strong performance with an average of ${Math.round(avgPerf)}/100 across ${perfScores.length} pages.`
          : `Average performance is ${Math.round(avgPerf)}/100. ${poorPerfCount} page${poorPerfCount !== 1 ? 's' : ''} score${poorPerfCount === 1 ? 's' : ''} below 50, dragging down the overall score.`
        : 'No performance data available.',
    },
    {
      name: 'INP',
      weight: 0.20,
      weightLabel: '20%',
      score: avgInpScore !== null ? Math.round(avgInpScore) : null,
      benchmark: 'Good: < 200ms, Needs Improvement: 200-500ms',
      status: getStatus(avgInpScore),
      insight: inpValues.length > 0
        ? goodInpCount === inpValues.length
          ? `All ${inpValues.length} pages have good INP (< 200ms).`
          : `${goodInpCount} of ${inpValues.length} pages have good INP. ${inpValues.length - goodInpCount} need improvement.`
        : 'No INP data available.',
    },
    {
      name: 'Crawlability',
      weight: 0.15,
      weightLabel: '15%',
      score: Math.round(crawlabilityScore),
      benchmark: 'All pages should return HTTP 200 with DOM < 1,400 nodes',
      status: getStatus(crawlabilityScore),
      insight: httpOkCount === pages.length && domOkCount === pages.length
        ? 'All pages are crawlable with healthy DOM sizes.'
        : `${httpOkCount} of ${pages.length} pages return successful HTTP status. ${domOkCount} have DOM under 1,400 nodes.`,
    },
    {
      name: 'Mobile',
      weight: 0.15,
      weightLabel: '15%',
      score: mobileScore !== null ? Math.round(mobileScore) : null,
      benchmark: 'All pages should pass mobile-friendliness checks',
      status: getStatus(mobileScore),
      insight: mobileValues.length > 0
        ? mobilePassCount === mobileValues.length
          ? `All ${mobileValues.length} tested pages are mobile-friendly.`
          : `${mobilePassCount} of ${mobileValues.length} pages pass mobile-friendly checks. ${mobileValues.length - mobilePassCount} have issues.`
        : 'No mobile data available.',
    },
    {
      name: 'Crawl Depth',
      weight: 0.10,
      weightLabel: '10%',
      score: depthScore !== null ? Math.round(depthScore) : null,
      benchmark: 'Important pages should be within 3 clicks of homepage',
      status: getStatus(depthScore),
      insight: depthValues.length > 0
        ? depthOkCount === depthValues.length
          ? `All ${depthValues.length} pages are within 3 clicks of the homepage.`
          : `${depthOkCount} of ${depthValues.length} pages are within 3 clicks. ${depthValues.length - depthOkCount} are buried too deep.`
        : 'No crawl depth data available.',
    },
    {
      name: 'Security',
      weight: 0.10,
      weightLabel: '10%',
      score: securityScore,
      benchmark: 'Zero security header issues is the target',
      status: getStatus(securityScore),
      insight: step6Issues === 0
        ? 'All security headers are properly configured.'
        : `${step6Issues} security issue${step6Issues > 1 ? 's' : ''} found. Each missing header reduces the security score.`,
    },
    {
      name: 'Accessibility',
      weight: 0.05,
      weightLabel: '5%',
      score: avgA11y !== null ? Math.round(avgA11y) : null,
      benchmark: 'WCAG 2.1 AA compliance; target score 90+',
      status: getStatus(avgA11y),
      insight: avgA11y !== null
        ? avgA11y >= 90
          ? `Excellent accessibility with an average score of ${Math.round(avgA11y)}/100.`
          : `Average accessibility score is ${Math.round(avgA11y)}/100. Review violations for WCAG compliance.`
        : 'No accessibility data available.',
    },
  ];

  // ── Relevance components ──

  // Title & Meta (25%)
  const withTitle = pages.filter((p) => p.titleTag && p.titleTag.trim().length > 0);
  const goodTitle = pages.filter((p) => (p.titleLength ?? 0) >= 30 && (p.titleLength ?? 0) <= 60);
  const withMeta = pages.filter((p) => p.metaDescription && p.metaDescription.trim().length > 0);
  const titleMetaScore = pages.length > 0 ? ((goodTitle.length / pages.length) * 50 + (withMeta.length / pages.length) * 50) : null;

  components.push({
    name: 'Title & Meta',
    weight: 0.25,
    weightLabel: '25%',
    score: titleMetaScore !== null ? Math.round(titleMetaScore) : null,
    benchmark: 'All pages with optimized titles (30-60 chars) and meta descriptions',
    status: getStatus(titleMetaScore),
    insight: titleMetaScore !== null
      ? titleMetaScore >= 80
        ? `${pct(withTitle.length, pages.length)}% of pages have title tags, ${pct(goodTitle.length, pages.length)}% are optimal length.`
        : `Only ${pct(goodTitle.length, pages.length)}% of titles are optimal length. ${pct(withMeta.length, pages.length)}% have meta descriptions.`
      : 'No title/meta data available.',
  });

  // Content Depth (20%)
  const wordCounts = pages.map((p) => p.wordCount).filter((v): v is number => v !== null);
  const substantivePages = wordCounts.filter((w) => w >= 300);
  const contentDepthScore = wordCounts.length > 0 ? (substantivePages.length / wordCounts.length) * 100 : null;
  const avgWordCount = avg(wordCounts);

  components.push({
    name: 'Content Depth',
    weight: 0.20,
    weightLabel: '20%',
    score: contentDepthScore !== null ? Math.round(contentDepthScore) : null,
    benchmark: '300+ words for substantive content',
    status: getStatus(contentDepthScore),
    insight: contentDepthScore !== null
      ? `${pct(substantivePages.length, wordCounts.length)}% of pages have 300+ words. Average: ${Math.round(avgWordCount ?? 0)} words.`
      : 'No word count data available.',
  });

  // Headings (15%)
  const singleH1Pages = pages.filter((p) => p.h1Count === 1);
  const headingsScore = pages.length > 0 ? (singleH1Pages.length / pages.length) * 100 : null;

  components.push({
    name: 'Headings',
    weight: 0.15,
    weightLabel: '15%',
    score: headingsScore !== null ? Math.round(headingsScore) : null,
    benchmark: 'All pages with exactly 1 H1',
    status: getStatus(headingsScore),
    insight: headingsScore !== null
      ? `${pct(singleH1Pages.length, pages.length)}% of pages have exactly one H1 tag.`
      : 'No heading data available.',
  });

  // Internal Linking (15%)
  const linkedPages = pages.filter((p) => p.internalLinksInbound !== null && p.internalLinksInbound > 0);
  const pagesWithLinkData = pages.filter((p) => p.internalLinksInbound !== null);
  const linkingScore = pagesWithLinkData.length > 0 ? (linkedPages.length / pagesWithLinkData.length) * 100 : null;

  components.push({
    name: 'Internal Linking',
    weight: 0.15,
    weightLabel: '15%',
    score: linkingScore !== null ? Math.round(linkingScore) : null,
    benchmark: 'All pages have internal links pointing to them',
    status: getStatus(linkingScore),
    insight: linkingScore !== null
      ? `${pct(linkedPages.length, pagesWithLinkData.length)}% of pages have inbound internal links. ${pagesWithLinkData.length - linkedPages.length} orphan pages.`
      : 'No internal linking data available.',
  });

  // Content Freshness (10%)
  const pagesWithDecay = pages.filter((p) => p.decayBucket !== null);
  const healthyPages = pagesWithDecay.filter((p) => p.decayBucket === 'HEALTHY');
  const freshnessScore = pagesWithDecay.length > 0 ? (healthyPages.length / pagesWithDecay.length) * 100 : null;

  components.push({
    name: 'Content Freshness',
    weight: 0.10,
    weightLabel: '10%',
    score: freshnessScore !== null ? Math.round(freshnessScore) : null,
    benchmark: 'Content updated within 6 months',
    status: getStatus(freshnessScore),
    insight: freshnessScore !== null
      ? `${pct(healthyPages.length, pagesWithDecay.length)}% of pages have fresh content (updated within 6 months).`
      : 'No content freshness data available.',
  });

  // Schema (10%)
  const step13Issues = issues.filter((i) => i.stepNumber === 13).length;
  const rSchemaScore = Math.max(0, 100 - step13Issues * 10);

  components.push({
    name: 'Schema Markup',
    weight: 0.10,
    weightLabel: '10%',
    score: rSchemaScore,
    benchmark: 'All pages with JSON-LD structured data',
    status: getStatus(rSchemaScore),
    insight: step13Issues === 0
      ? 'Structured data is properly implemented.'
      : `${step13Issues} schema issue${step13Issues > 1 ? 's' : ''} found.`,
  });

  // Images (5%)
  const step14Issues = issues.filter((i) => i.stepNumber === 14).length;
  const rImageScore = Math.max(0, 100 - step14Issues * 8);

  components.push({
    name: 'Images',
    weight: 0.05,
    weightLabel: '5%',
    score: rImageScore,
    benchmark: 'All images optimized with alt text, modern formats, correct sizing',
    status: getStatus(rImageScore),
    insight: step14Issues === 0
      ? 'All images are properly optimized.'
      : `${step14Issues} image optimization issue${step14Issues > 1 ? 's' : ''} found.`,
  });

  // ── Authority components ──

  // E-E-A-T (35%)
  const eeatScores = pages.map((p) => p.eeatScore).filter((s): s is number => s !== null);
  const avgEeat = avg(eeatScores);

  components.push({
    name: 'E-E-A-T',
    weight: 0.35,
    weightLabel: '35%',
    score: avgEeat !== null ? Math.round(avgEeat) : null,
    benchmark: 'Strong author, trust, and expertise signals',
    status: getStatus(avgEeat),
    insight: avgEeat !== null
      ? avgEeat >= 70
        ? `Good E-E-A-T signals with an average score of ${Math.round(avgEeat)}/100.`
        : `E-E-A-T score of ${Math.round(avgEeat)}/100 indicates room to strengthen trust signals.`
      : 'No E-E-A-T data available.',
  });

  // Backlink Quality (25%)
  const step15Issues = issues.filter((i) => i.stepNumber === 15).length;
  const aBacklinkScore = Math.max(0, 100 - step15Issues * 12);

  components.push({
    name: 'Backlink Quality',
    weight: 0.25,
    weightLabel: '25%',
    score: aBacklinkScore,
    benchmark: 'Clean outbound link profile with social profiles',
    status: getStatus(aBacklinkScore),
    insight: step15Issues === 0
      ? 'Outbound link profile is healthy.'
      : `${step15Issues} outbound link issue${step15Issues > 1 ? 's' : ''} found.`,
  });

  // AI Citation Readiness (20%)
  const step16Issues = issues.filter(
    (i) => i.stepNumber === 16 && !NON_SCORING_ISSUE_CATEGORIES.has(i.category)
  ).length;
  const aAiCitationScore = Math.max(0, 100 - step16Issues * 15);

  components.push({
    name: 'AI Citations',
    weight: 0.20,
    weightLabel: '20%',
    score: aAiCitationScore,
    benchmark: 'Content optimized for AI search citation',
    status: getStatus(aAiCitationScore),
    insight: step16Issues === 0
      ? 'Content is well-structured for AI citation.'
      : `${step16Issues} AI citation readiness issue${step16Issues > 1 ? 's' : ''} found.`,
  });

  // Brand Signals (20%)
  const step18Issues = issues.filter((i) => i.stepNumber === 18).length;
  const aBrandScore = Math.max(0, 100 - step18Issues * 12);

  components.push({
    name: 'Brand Signals',
    weight: 0.20,
    weightLabel: '20%',
    score: aBrandScore,
    benchmark: 'Consistent brand identity across the site',
    status: getStatus(aBrandScore),
    insight: step18Issues === 0
      ? 'Brand signals are strong and consistent.'
      : `${step18Issues} brand consistency issue${step18Issues > 1 ? 's' : ''} found.`,
  });

  // Calculate weighted pillar scores
  const usabilityComponents = components.slice(0, 7);
  const relevanceComponents = components.slice(7, 14);
  const authorityComponents = components.slice(14);

  const usabilityScore = computeWeightedScore(usabilityComponents);
  const relevanceScore = computeWeightedScore(relevanceComponents);
  const authorityScore = computeWeightedScore(authorityComponents);

  return { usabilityScore, relevanceScore, authorityScore, components };
}

function computeWeightedScore(components: ScoreComponent[]): number | null {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const comp of components) {
    if (comp.score !== null) {
      weightedSum += comp.score * comp.weight;
      totalWeight += comp.weight;
    }
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}

// ─── Priority Actions ───────────────────────────────────────────

function computePriorityActions(issues: ReportIssueInput[]): PriorityAction[] {
  const categoryMap = new Map<
    string,
    {
      urls: Set<string>;
      maxSeverity: string;
      messages: string[];
      recommendations: string[];
    }
  >();

  for (const issue of issues) {
    let entry = categoryMap.get(issue.category);
    if (!entry) {
      entry = { urls: new Set(), maxSeverity: 'MINOR', messages: [], recommendations: [] };
      categoryMap.set(issue.category, entry);
    }
    if (issue.url) entry.urls.add(issue.url);
    if ((SEVERITY_WEIGHT[issue.severity] ?? 0) > (SEVERITY_WEIGHT[entry.maxSeverity] ?? 0)) {
      entry.maxSeverity = issue.severity;
    }
    if (entry.messages.length < 5) entry.messages.push(issue.message);
    if (issue.recommendation && entry.recommendations.length < 5) {
      entry.recommendations.push(issue.recommendation);
    }
  }

  const actions: PriorityAction[] = [...categoryMap.entries()].map(([category, data]) => {
    const impactScore = (SEVERITY_WEIGHT[data.maxSeverity] ?? 1) * data.urls.size;
    const isCriticalFix =
      (data.maxSeverity === 'CRITICAL' || data.maxSeverity === 'SERIOUS') && data.urls.size > 0;

    // Use the most common recommendation, or synthesize from category
    const howToFix = data.recommendations[0] ?? CATEGORY_IMPACT[category] ?? 'Review and address the flagged issues.';

    return {
      category,
      group: isCriticalFix ? 'critical-fixes' as const : 'quick-wins' as const,
      severity: data.maxSeverity,
      impactScore,
      problem: summarizeProblem(category, data.messages, data.urls.size),
      whyItMatters: CATEGORY_IMPACT[category] ?? 'This issue affects your site\'s search visibility and user experience.',
      howToFix,
      affectedPageCount: data.urls.size,
      sampleUrls: [...data.urls].slice(0, 3),
    };
  });

  return actions.sort((a, b) => b.impactScore - a.impactScore);
}

function summarizeProblem(category: string, messages: string[], urlCount: number): string {
  // Use the first message as a representative problem description
  const sample = messages[0] ?? `${category} issue detected`;
  if (urlCount > 1) {
    return `${sample} Found across ${urlCount} pages.`;
  }
  return sample;
}

// ─── Step Insights ──────────────────────────────────────────────

function computeStepInsights(
  pages: ReportPageInput[],
  issues: ReportIssueInput[],
  selectedSteps?: number[]
): StepInsight[] {
  const steps: StepInsight[] = [];
  const configured = new Set(
    (selectedSteps ?? [])
      .filter((step) => Number.isInteger(step) && step >= 1 && step <= 18)
  );
  const hasConfiguredSteps = configured.size > 0;

  for (let step = 1; step <= 18; step++) {
    if (hasConfiguredSteps && !configured.has(step)) {
      continue;
    }
    const stepIssues = issues.filter((i) => i.stepNumber === step);
    // Always show usability (1-7). Show relevance/authority steps only if they have issues.
    if (step > 7 && stepIssues.length === 0) continue;
    const stepName = STEP_NAMES[step] ?? `Step ${step}`;
    const insight = computeSingleStepInsight(step, stepName, pages, stepIssues);
    steps.push(insight);
  }

  return steps;
}

function computeSingleStepInsight(
  stepNumber: number,
  stepName: string,
  pages: ReportPageInput[],
  stepIssues: ReportIssueInput[]
): StepInsight {
  const positiveSignals: string[] = [];
  let passCount = 0;
  let failCount = 0;
  let totalRelevant = pages.length;
  let keyMetric: StepInsight['keyMetric'] = null;

  // URLs with issues for this step
  const failedUrls = new Set(stepIssues.map((i) => i.url).filter(Boolean));

  switch (stepNumber) {
    case 1: { // Crawlability
      const httpOkPages = pages.filter((p) => p.httpStatus !== null && p.httpStatus >= 200 && p.httpStatus < 400);
      const domOkPages = pages.filter((p) => p.domNodeCount === null || p.domNodeCount <= 1400);
      const canonicalPages = pages.filter((p) => {
        const details = p.details as { canonicalUrl?: string | null } | null;
        return details?.canonicalUrl != null;
      });

      passCount = pages.filter((p) => {
        const httpOk = p.httpStatus !== null && p.httpStatus >= 200 && p.httpStatus < 400;
        const domOk = p.domNodeCount === null || p.domNodeCount <= 1400;
        return httpOk && domOk;
      }).length;
      failCount = totalRelevant - passCount;

      const domValues = pages.map((p) => p.domNodeCount).filter((v): v is number => v !== null);
      const avgDom = avg(domValues);
      keyMetric = avgDom !== null ? {
        label: 'Average DOM Size',
        value: `${Math.round(avgDom).toLocaleString()} nodes`,
        benchmark: 'Recommended: < 1,400 nodes',
        status: avgDom <= 1400 ? 'good' : avgDom <= 2000 ? 'warning' : 'poor',
      } : null;

      if (httpOkPages.length === pages.length) positiveSignals.push('All pages return successful HTTP status');
      if (domOkPages.length === pages.length) positiveSignals.push('All pages have healthy DOM size (< 1,400 nodes)');
      if (canonicalPages.length > 0) positiveSignals.push(`${pct(canonicalPages.length, pages.length)}% of pages have canonical tags`);

      // AI bot check
      const aiBotIssues = stepIssues.filter((i) => i.category === 'AI Bot Access');
      if (aiBotIssues.length === 0) positiveSignals.push('No AI crawlers are blocked in robots.txt');
      break;
    }

    case 2: { // Crawl Depth
      const depthValues = pages.map((p) => p.crawlDepth).filter((v): v is number => v !== null);
      const okDepth = depthValues.filter((d) => d <= 3);
      const orphans = pages.filter((p) => p.crawlDepth === null);
      totalRelevant = pages.length;
      passCount = okDepth.length;
      failCount = depthValues.filter((d) => d > 3).length + orphans.length;

      const avgDepth = avg(depthValues);
      keyMetric = avgDepth !== null ? {
        label: 'Average Crawl Depth',
        value: `${avgDepth.toFixed(1)} clicks`,
        benchmark: 'Recommended: <= 3 clicks from homepage',
        status: avgDepth <= 3 ? 'good' : avgDepth <= 4 ? 'warning' : 'poor',
      } : null;

      if (orphans.length === 0) positiveSignals.push('No orphan pages detected');
      if (okDepth.length === depthValues.length && depthValues.length > 0) {
        positiveSignals.push('All pages reachable within 3 clicks');
      } else if (depthValues.length > 0) {
        positiveSignals.push(`${pct(okDepth.length, depthValues.length)}% of pages within 3 clicks`);
      }
      break;
    }

    case 3: { // Page Speed
      const perfScores = pages.map((p) => p.performanceScore).filter((s): s is number => s !== null);
      totalRelevant = perfScores.length;
      passCount = perfScores.filter((s) => s >= 80).length;
      failCount = totalRelevant - passCount;

      const lcpValues = pages
        .map((p) => {
          const details = p.details as { psi?: { lcpMs?: number | null } } | null;
          return details?.psi?.lcpMs ?? null;
        })
        .filter((v): v is number => v !== null);

      const avgLcp = avg(lcpValues);
      keyMetric = avgLcp !== null ? {
        label: 'Average LCP',
        value: `${Math.round(avgLcp).toLocaleString()}ms`,
        benchmark: 'Google recommends < 2,500ms',
        status: avgLcp <= 2500 ? 'good' : avgLcp <= 4000 ? 'warning' : 'poor',
      } : null;

      const excellentPages = perfScores.filter((s) => s >= 90).length;
      if (excellentPages > 0) positiveSignals.push(`${excellentPages} page${excellentPages > 1 ? 's' : ''} score${excellentPages === 1 ? 's' : ''} 90+ (excellent)`);

      const clsValues = pages
        .map((p) => {
          const details = p.details as { psi?: { clsValue?: number | null } } | null;
          return details?.psi?.clsValue ?? null;
        })
        .filter((v): v is number => v !== null);
      const avgCls = avg(clsValues);
      if (avgCls !== null && avgCls <= 0.1) positiveSignals.push(`Average CLS is ${avgCls.toFixed(3)} (good)`);
      break;
    }

    case 4: { // INP
      const inpValues = pages.map((p) => p.inpValue).filter((v): v is number => v !== null);
      totalRelevant = inpValues.length;
      passCount = inpValues.filter((ms) => ms < 200).length;
      failCount = totalRelevant - passCount;

      const avgInp = avg(inpValues);
      keyMetric = avgInp !== null ? {
        label: 'Average INP',
        value: `${Math.round(avgInp)}ms`,
        benchmark: 'Good: < 200ms, Needs Improvement: 200-500ms',
        status: avgInp < 200 ? 'good' : avgInp < 500 ? 'warning' : 'poor',
      } : null;

      if (passCount > 0 && totalRelevant > 0) {
        positiveSignals.push(`${pct(passCount, totalRelevant)}% of pages have good INP (< 200ms)`);
      }
      break;
    }

    case 5: { // Mobile
      const mobileValues = pages.filter((p) => p.mobileFriendly !== null);
      totalRelevant = mobileValues.length;
      passCount = mobileValues.filter((p) => p.mobileFriendly === true).length;
      failCount = totalRelevant - passCount;

      const passRate = totalRelevant > 0 ? pct(passCount, totalRelevant) : 0;
      keyMetric = totalRelevant > 0 ? {
        label: 'Mobile Pass Rate',
        value: `${passRate}%`,
        benchmark: 'All pages should be mobile-friendly',
        status: passRate >= 100 ? 'good' : passRate >= 80 ? 'warning' : 'poor',
      } : null;

      if (passCount === totalRelevant && totalRelevant > 0) {
        positiveSignals.push('All tested pages are mobile-friendly');
      }
      const viewportIssues = stepIssues.filter((i) => i.category === 'Viewport');
      if (viewportIssues.length === 0 && totalRelevant > 0) {
        positiveSignals.push('All pages have viewport meta tag');
      }
      break;
    }

    case 6: { // Security
      // Security is site-level, not per-page
      const securityScore = Math.max(0, 100 - stepIssues.length * 15);
      passCount = stepIssues.length === 0 ? 1 : 0;
      failCount = stepIssues.length > 0 ? 1 : 0;
      totalRelevant = 1; // site-level check

      keyMetric = {
        label: 'Security Score',
        value: `${securityScore}/100`,
        benchmark: 'Target: zero security header issues',
        status: getStatus(securityScore),
      };

      const httpsIssues = stepIssues.filter((i) => i.category === 'HTTPS');
      if (httpsIssues.length === 0) positiveSignals.push('Site uses HTTPS');
      const hstsIssues = stepIssues.filter((i) => i.category === 'HSTS');
      if (hstsIssues.length === 0) positiveSignals.push('HSTS header is properly configured');
      const cspIssues = stepIssues.filter((i) => i.category === 'CSP');
      if (cspIssues.length === 0) positiveSignals.push('Content-Security-Policy header present');
      break;
    }

    case 7: { // Accessibility
      const a11yScores = pages.map((p) => p.accessibilityScore).filter((s): s is number => s !== null);
      totalRelevant = a11yScores.length;
      passCount = a11yScores.filter((s) => s >= 80).length;
      failCount = totalRelevant - passCount;

      const avgA11y = avg(a11yScores);
      keyMetric = avgA11y !== null ? {
        label: 'Average Accessibility Score',
        value: `${Math.round(avgA11y)}/100`,
        benchmark: 'WCAG 2.1 AA compliance; target 90+',
        status: getStatus(avgA11y),
      } : null;

      const perfectPages = a11yScores.filter((s) => s >= 95).length;
      if (perfectPages > 0) positiveSignals.push(`${perfectPages} page${perfectPages > 1 ? 's' : ''} score 95+ (near-perfect)`);
      if (avgA11y !== null && avgA11y >= 80) positiveSignals.push(`Average score of ${Math.round(avgA11y)} indicates good baseline compliance`);
      break;
    }

    case 8: { // Title & Meta
      const withTitle = pages.filter((p) => p.titleTag && p.titleTag.trim().length > 0);
      const goodTitle = pages.filter((p) => (p.titleLength ?? 0) >= 30 && (p.titleLength ?? 0) <= 60);
      const withMeta = pages.filter((p) => p.metaDescription && p.metaDescription.trim().length > 0);
      const goodMeta = pages.filter((p) => (p.metaDescriptionLength ?? 0) >= 120 && (p.metaDescriptionLength ?? 0) <= 160);

      passCount = goodTitle.length;
      failCount = pages.length - passCount;
      keyMetric = { label: 'Title Tag Coverage', value: `${pct(withTitle.length, pages.length)}%`, benchmark: '100% with 30-60 chars', status: pct(withTitle.length, pages.length) >= 90 ? 'good' : pct(withTitle.length, pages.length) >= 70 ? 'warning' : 'poor' };

      if (pct(withTitle.length, pages.length) === 100) positiveSignals.push('All pages have title tags');
      if (pct(goodTitle.length, pages.length) >= 80) positiveSignals.push(`${pct(goodTitle.length, pages.length)}% of titles are optimal length`);
      if (pct(withMeta.length, pages.length) >= 90) positiveSignals.push(`${pct(withMeta.length, pages.length)}% have meta descriptions`);
      if (pct(goodMeta.length, pages.length) >= 70) positiveSignals.push(`${pct(goodMeta.length, pages.length)}% of meta descriptions are optimal length`);
      break;
    }

    case 9: { // Headings
      const withH1 = pages.filter((p) => p.h1Count === 1);
      passCount = withH1.length;
      failCount = pages.length - passCount;
      keyMetric = { label: 'Single H1 Rate', value: `${pct(withH1.length, pages.length)}%`, benchmark: '100% with exactly 1 H1', status: pct(withH1.length, pages.length) >= 90 ? 'good' : pct(withH1.length, pages.length) >= 70 ? 'warning' : 'poor' };

      if (pct(withH1.length, pages.length) === 100) positiveSignals.push('All pages have exactly one H1');
      const noH1 = pages.filter((p) => p.h1Count !== null && p.h1Count === 0).length;
      if (noH1 === 0) positiveSignals.push('No pages are missing H1 tags');
      break;
    }

    case 10: { // NLP Keywords
      const withContent = pages.filter((p) => p.wordCount !== null && p.wordCount >= 300);
      passCount = withContent.length;
      totalRelevant = pages.filter((p) => p.wordCount !== null).length;
      failCount = totalRelevant - passCount;
      const avgWords = pages.filter((p) => p.wordCount !== null).reduce((s, p) => s + (p.wordCount ?? 0), 0) / (totalRelevant || 1);
      keyMetric = { label: 'Avg Word Count', value: `${Math.round(avgWords)} words`, benchmark: '300+ for substantive content', status: avgWords >= 500 ? 'good' : avgWords >= 300 ? 'warning' : 'poor' };

      if (pct(passCount, totalRelevant) >= 80) positiveSignals.push(`${pct(passCount, totalRelevant)}% of pages have 300+ words`);
      if (avgWords >= 500) positiveSignals.push(`Average ${Math.round(avgWords)} words indicates substantive content`);
      break;
    }

    case 11: { // Internal Linking
      const linked = pages.filter((p) => p.internalLinksInbound !== null && p.internalLinksInbound > 0);
      const withData = pages.filter((p) => p.internalLinksInbound !== null);
      passCount = linked.length;
      totalRelevant = withData.length;
      failCount = totalRelevant - passCount;
      const orphans = totalRelevant - linked.length;
      keyMetric = { label: 'Orphan Pages', value: `${orphans}`, benchmark: '0 orphan pages', status: orphans === 0 ? 'good' : orphans <= 2 ? 'warning' : 'poor' };

      if (orphans === 0) positiveSignals.push('No orphan pages — all pages have internal links');
      const avgInbound = withData.length > 0 ? withData.reduce((s, p) => s + (p.internalLinksInbound ?? 0), 0) / withData.length : 0;
      if (avgInbound >= 3) positiveSignals.push(`Average ${avgInbound.toFixed(1)} inbound links per page`);
      break;
    }

    case 12: { // Content Freshness
      const healthy = pages.filter((p) => p.details && typeof p.details === 'object');
      // Use issue count as proxy — fewer issues = fresher content
      passCount = pages.length - failedUrls.size;
      failCount = failedUrls.size;
      keyMetric = { label: 'Fresh Content', value: `${pct(passCount, pages.length)}%`, benchmark: 'Content updated within 6 months', status: pct(passCount, pages.length) >= 80 ? 'good' : pct(passCount, pages.length) >= 50 ? 'warning' : 'poor' };
      void healthy; // used pages count

      if (stepIssues.length === 0) positiveSignals.push('All content appears fresh');
      if (failCount <= 1) positiveSignals.push('Minimal content decay detected');
      break;
    }

    case 13: { // Schema
      passCount = pages.length - failedUrls.size;
      failCount = failedUrls.size;
      keyMetric = { label: 'Schema Coverage', value: `${pct(passCount, pages.length)}%`, benchmark: 'All pages with JSON-LD', status: pct(passCount, pages.length) >= 80 ? 'good' : pct(passCount, pages.length) >= 50 ? 'warning' : 'poor' };

      if (stepIssues.length === 0) positiveSignals.push('Structured data present on all sampled pages');
      const orgIssue = stepIssues.find((i) => i.category === 'Organization Schema');
      if (!orgIssue) positiveSignals.push('Organization schema detected');
      break;
    }

    case 14: { // Images
      passCount = pages.length - failedUrls.size;
      failCount = failedUrls.size;
      keyMetric = { label: 'Image Optimization', value: `${pct(passCount, pages.length)}%`, benchmark: 'All images optimized', status: pct(passCount, pages.length) >= 80 ? 'good' : pct(passCount, pages.length) >= 50 ? 'warning' : 'poor' };

      if (stepIssues.length === 0) positiveSignals.push('All images properly optimized');
      const altIssues = stepIssues.filter((i) => i.category === 'Missing Alt Text');
      if (altIssues.length === 0) positiveSignals.push('All images have alt text');
      break;
    }

    case 15: { // Backlink Profile
      totalRelevant = 1; // site-level
      passCount = stepIssues.length === 0 ? 1 : 0;
      failCount = stepIssues.length > 0 ? 1 : 0;
      const backlinkScore = Math.max(0, 100 - stepIssues.length * 12);
      keyMetric = { label: 'Backlink Health', value: `${backlinkScore}/100`, benchmark: 'Zero outbound link issues', status: getStatus(backlinkScore) };

      if (stepIssues.length === 0) positiveSignals.push('No outbound link issues detected');
      const socialIssues = stepIssues.filter((i) => i.category === 'Missing Social Profiles');
      if (socialIssues.length === 0) positiveSignals.push('Social profile links detected in structured data');
      const externalRefIssues = stepIssues.filter((i) => i.category === 'No External References');
      if (externalRefIssues.length === 0) positiveSignals.push('Pages cite external sources');
      break;
    }

    case 16: { // AI Citations
      const scoredStepIssues = stepIssues.filter(
        (i) => !NON_SCORING_ISSUE_CATEGORIES.has(i.category)
      );
      totalRelevant = 1; // site-level
      passCount = scoredStepIssues.length === 0 ? 1 : 0;
      failCount = scoredStepIssues.length > 0 ? 1 : 0;
      const aiScore = Math.max(0, 100 - scoredStepIssues.length * 15);
      keyMetric = { label: 'AI Citation Readiness', value: `${aiScore}/100`, benchmark: 'Content optimized for AI search', status: getStatus(aiScore) };

      if (scoredStepIssues.length === 0) positiveSignals.push('Content well-structured for AI citation');
      const botIssues = stepIssues.filter((i) => i.category === 'AI Bot Blocked');
      if (botIssues.length === 0) positiveSignals.push('AI crawlers are not blocked');
      const faqIssues = stepIssues.filter((i) => i.category === 'Missing FAQ Schema');
      if (faqIssues.length === 0 && scoredStepIssues.length > 0) positiveSignals.push('FAQ structured data present');
      break;
    }

    case 17: { // E-E-A-T
      totalRelevant = 1; // site-level
      passCount = stepIssues.length === 0 ? 1 : 0;
      failCount = stepIssues.length > 0 ? 1 : 0;
      const eeatIssueScore = Math.max(0, 100 - stepIssues.length * 10);
      keyMetric = { label: 'E-E-A-T Score', value: `${eeatIssueScore}/100`, benchmark: 'Strong trust and expertise signals', status: getStatus(eeatIssueScore) };

      const aboutIssues = stepIssues.filter((i) => i.category === 'Missing About Page');
      if (aboutIssues.length === 0) positiveSignals.push('About page present');
      const contactIssues = stepIssues.filter((i) => i.category === 'Missing Contact Page');
      if (contactIssues.length === 0) positiveSignals.push('Contact page present');
      const privacyIssues = stepIssues.filter((i) => i.category === 'Missing Privacy Policy');
      if (privacyIssues.length === 0) positiveSignals.push('Privacy policy present');
      const authorIssues = stepIssues.filter((i) => i.category === 'Missing Author Byline' || i.category === 'No Author Attribution');
      if (authorIssues.length === 0) positiveSignals.push('Author attribution present on content pages');
      break;
    }

    case 18: { // Brand Mentions
      totalRelevant = 1; // site-level
      passCount = stepIssues.length === 0 ? 1 : 0;
      failCount = stepIssues.length > 0 ? 1 : 0;
      const brandScore = Math.max(0, 100 - stepIssues.length * 12);
      keyMetric = { label: 'Brand Signal Score', value: `${brandScore}/100`, benchmark: 'Strong brand consistency', status: getStatus(brandScore) };

      const orgIssues = stepIssues.filter((i) => i.category === 'Missing Organization Schema');
      if (orgIssues.length === 0) positiveSignals.push('Organization schema present');
      const socialIssues = stepIssues.filter((i) => i.category === 'No Social Profile Links');
      if (socialIssues.length === 0) positiveSignals.push('Social profile links detected');
      const titleIssues = stepIssues.filter((i) => i.category === 'Brand Name Missing from Titles');
      if (titleIssues.length === 0) positiveSignals.push('Brand name appears in title tags');
      break;
    }
  }

  const passRate = totalRelevant > 0 ? pct(passCount, totalRelevant) : 0;

  return {
    stepNumber,
    stepName,
    passCount,
    failCount,
    totalRelevant,
    passRate,
    status: passRate >= 80 ? 'good' : passRate >= 50 ? 'warning' : 'poor',
    keyMetric,
    positiveSignals,
    issues: stepIssues,
  };
}

// ─── Worst Performers ───────────────────────────────────────────

function computeWorstPerformers(
  pages: ReportPageInput[],
  issues: ReportIssueInput[]
): WorstPerformer[] {
  const urlMap = new Map<
    string,
    {
      issueCount: number;
      criticalCount: number;
      seriousCount: number;
      stepNumbers: Set<number>;
      performanceScore: number | null;
      accessibilityScore: number | null;
    }
  >();

  // Initialize from pages
  for (const page of pages) {
    urlMap.set(page.url, {
      issueCount: 0,
      criticalCount: 0,
      seriousCount: 0,
      stepNumbers: new Set(),
      performanceScore: page.performanceScore,
      accessibilityScore: page.accessibilityScore,
    });
  }

  // Count issues per URL
  for (const issue of issues) {
    if (!issue.url) continue;
    let entry = urlMap.get(issue.url);
    if (!entry) {
      entry = {
        issueCount: 0,
        criticalCount: 0,
        seriousCount: 0,
        stepNumbers: new Set(),
        performanceScore: null,
        accessibilityScore: null,
      };
      urlMap.set(issue.url, entry);
    }
    entry.issueCount++;
    if (issue.severity === 'CRITICAL') entry.criticalCount++;
    if (issue.severity === 'SERIOUS') entry.seriousCount++;
    entry.stepNumbers.add(issue.stepNumber);
  }

  return [...urlMap.entries()]
    .filter(([, data]) => data.issueCount > 0)
    .sort((a, b) => {
      // Sort by critical count first, then total issue count
      if (b[1].criticalCount !== a[1].criticalCount) return b[1].criticalCount - a[1].criticalCount;
      return b[1].issueCount - a[1].issueCount;
    })
    .slice(0, 5)
    .map(([url, data]) => ({
      url,
      issueCount: data.issueCount,
      criticalCount: data.criticalCount,
      seriousCount: data.seriousCount,
      failedSteps: [...data.stepNumbers].map((n) => ({
        stepNumber: n,
        stepName: STEP_NAMES[n] ?? `Step ${n}`,
      })),
      performanceScore: data.performanceScore,
      accessibilityScore: data.accessibilityScore,
    }));
}
