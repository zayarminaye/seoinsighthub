import { chromium, type Browser, type Page } from 'playwright';
import type { StepJobData } from './orchestrator';
import { incrementCompletedPages, publishProgress } from './orchestrator';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import { WORKER_CONFIG } from '../queue/config';

interface CrawlResult {
  url: string;
  httpStatus: number;
  domNodeCount: number | null;
  internalLinks: string[];
  externalLinks: Array<{ href: string; rel: string | null; anchor: string | null }>;
  titleTag: string | null;
  metaDescription: string | null;
  h1Count: number | null;
  headingCount: number | null;
  listCount: number | null;
  hasDefinitions: boolean;
  ogTitle: string | null;
  ogImage: string | null;
  schemas: string[];
  schemaObjects: unknown[];
  wordCount: number | null;
  canonicalUrl: string | null;
  metaRobots: string | null;
}

interface RobotsTxtResult {
  raw: string;
  sitemapUrls: string[];
  disallowedPaths: string[];
  aiBotDirectives: Record<string, string[]>;
}

const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'CCBot',
  'Google-Extended',
  'anthropic-ai',
  'ClaudeBot',
  'Bytespider',
  'PerplexityBot',
  'Amazonbot',
];

/**
 * Step 1: Crawlability & Indexability
 * Crawls the target domain using Playwright BFS.
 * Discovers URLs, checks robots.txt, records page metadata.
 */
export async function runStep01Crawl(data: StepJobData): Promise<void> {
  const audit = await prisma.auditRun.findUniqueOrThrow({
    where: { id: data.auditRunId },
  });

  const domain = normalizeDomain(audit.targetDomain);
  const origin = new URL(domain).origin;
  const maxPages = audit.maxPages;

  // 1. Fetch and parse robots.txt
  const robotsResult = await fetchRobotsTxt(origin);

  // 2. BFS crawl
  const visited = new Set<string>();
  const queue: string[] = [domain];
  const results: CrawlResult[] = [];
  // Store link graph for Step 2
  const linkGraph: Record<string, string[]> = {};

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seoaudits.app)',
      viewport: { width: 1920, height: 1080 },
    });

    // Process URLs in batches of concurrent pages
    const concurrency = WORKER_CONFIG.playwright.maxConcurrentPages;

    while (queue.length > 0 && visited.size < maxPages) {
      const batch = queue.splice(
        0,
        Math.min(concurrency, maxPages - visited.size)
      );

      // Filter out already visited
      const toVisit = batch.filter((url) => !visited.has(url));
      if (toVisit.length === 0) continue;

      toVisit.forEach((url) => visited.add(url));

      const batchResults = await Promise.allSettled(
        toVisit.map((url) =>
          crawlPage(context.newPage(), url, origin, WORKER_CONFIG.playwright.pageTimeoutMs)
        )
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const cr = result.value;
          results.push(cr);
          linkGraph[cr.url] = cr.internalLinks;

          // Queue newly discovered internal links
          for (const link of cr.internalLinks) {
            if (!visited.has(link) && visited.size + queue.length < maxPages) {
              queue.push(link);
            }
          }
        }
      }

      // Report progress
      await publishProgress(data.auditRunId);
    }

    await context.close();
  } finally {
    if (browser) await browser.close();
  }

  // 3. Save results to database
  if (results.length === 0) {
    await prisma.auditRun.update({
      where: { id: data.auditRunId },
      data: { totalPages: 0 },
    });
    return;
  }

  // Batch create AuditPage records
  await prisma.auditPage.createMany({
    data: results.map((r) => ({
      auditRunId: data.auditRunId,
      url: r.url,
      httpStatus: r.httpStatus,
      domNodeCount: r.domNodeCount,
      titleTag: r.titleTag,
      titleLength: r.titleTag?.length ?? null,
      metaDescription: r.metaDescription,
      metaDescriptionLength: r.metaDescription?.length ?? null,
      h1Count: r.h1Count,
      wordCount: r.wordCount,
      internalLinksOutbound: r.internalLinks.length,
      details: {
        canonicalUrl: r.canonicalUrl,
        metaRobots: r.metaRobots,
        linkGraph: linkGraph[r.url] ?? [],
        externalLinks: r.externalLinks,
        schemas: r.schemas,
        schemaObjects: r.schemaObjects,
        headingCount: r.headingCount,
        listCount: r.listCount,
        hasDefinitions: r.hasDefinitions,
        ogTitle: r.ogTitle,
        ogImage: r.ogImage,
        robotsTxt: {
          aiBotDirectives: robotsResult.aiBotDirectives,
        },
      } as Prisma.InputJsonValue,
    })),
  });

  // Calculate inbound links
  const inboundCounts: Record<string, number> = {};
  for (const [, links] of Object.entries(linkGraph)) {
    for (const link of links) {
      inboundCounts[link] = (inboundCounts[link] ?? 0) + 1;
    }
  }

  // Update inbound link counts
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: { id: true, url: true },
  });

  for (const page of pages) {
    const inbound = inboundCounts[page.url] ?? 0;
    if (inbound > 0) {
      await prisma.auditPage.update({
        where: { id: page.id },
        data: { internalLinksInbound: inbound },
      });
    }
  }

  await prisma.auditRun.update({
    where: { id: data.auditRunId },
    data: { totalPages: results.length },
  });

  // 4. Create issues for robots.txt / indexability problems
  await createCrawlIssues(data.auditRunId, results, robotsResult, pages);

  await incrementCompletedPages(data.auditRunId, results.length);
}

/**
 * Crawl a single page and extract SEO-relevant data.
 */
async function crawlPage(
  pagePromise: Promise<Page>,
  url: string,
  origin: string,
  timeoutMs: number
): Promise<CrawlResult> {
  const page = await pagePromise;

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    const httpStatus = response?.status() ?? 0;

    // Extract page data
    const pageData = await page.evaluate(() => {
      const title = document.querySelector('title')?.textContent ?? null;
      const metaDesc =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content') ?? null;
      const canonical =
        document
          .querySelector('link[rel="canonical"]')
          ?.getAttribute('href') ?? null;
      const metaRobots =
        document
          .querySelector('meta[name="robots"]')
          ?.getAttribute('content') ?? null;
      const h1Count = document.querySelectorAll('h1').length;
      const headingCount = document.querySelectorAll(
        'h1, h2, h3, h4, h5, h6'
      ).length;
      const listCount = document.querySelectorAll('ul, ol').length;
      const domNodeCount = document.querySelectorAll('*').length;
      const ogTitle =
        document.querySelector('meta[property="og:title"]')?.getAttribute(
          'content'
        ) ?? null;
      const ogImage =
        document.querySelector('meta[property="og:image"]')?.getAttribute(
          'content'
        ) ?? null;

      // Word count from body text
      const bodyText = document.body?.innerText ?? '';
      const wordCount = bodyText
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
      const hasDefinitions =
        document.querySelector('dl, dt, dd') !== null ||
        /\b(is|are)\s+defined as\b/i.test(bodyText);

      // Internal links
      const links: Array<{ href: string; rel: string | null; anchor: string | null }> = [];
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (href) {
          links.push({
            href,
            rel: a.getAttribute('rel'),
            anchor: (a.textContent ?? '').trim().slice(0, 200) || null,
          });
        }
      });

      // JSON-LD schema extraction for downstream steps
      const schemas: string[] = [];
      const schemaObjects: unknown[] = [];
      document
        .querySelectorAll('script[type="application/ld+json"]')
        .forEach((script) => {
          try {
            const parsed = JSON.parse(script.textContent ?? '');
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of items) {
              if (!item || typeof item !== 'object') continue;
              const obj = item as Record<string, unknown>;
              schemaObjects.push(item);
              const typeVal = obj['@type'];
              const typeList = Array.isArray(typeVal) ? typeVal : [typeVal];
              for (const t of typeList) {
                if (typeof t === 'string') schemas.push(t);
              }
            }
          } catch {
            // Skip invalid JSON-LD blocks
          }
        });

      return {
        title,
        metaDesc,
        canonical,
        metaRobots,
        h1Count,
        headingCount,
        listCount,
        domNodeCount,
        hasDefinitions,
        ogTitle,
        ogImage,
        schemas,
        schemaObjects,
        wordCount,
        links,
      };
    });

    // Resolve and filter internal links
    const internalLinks = resolveInternalLinks(
      pageData.links.map((l) => l.href),
      url,
      origin
    );
    const externalLinks = resolveExternalLinks(pageData.links, url, origin);

    return {
      url,
      httpStatus,
      domNodeCount: pageData.domNodeCount,
      internalLinks,
      externalLinks,
      titleTag: pageData.title,
      metaDescription: pageData.metaDesc,
      h1Count: pageData.h1Count,
      headingCount: pageData.headingCount,
      listCount: pageData.listCount,
      hasDefinitions: pageData.hasDefinitions,
      ogTitle: pageData.ogTitle,
      ogImage: pageData.ogImage,
      schemas: pageData.schemas,
      schemaObjects: pageData.schemaObjects,
      wordCount: pageData.wordCount,
      canonicalUrl: pageData.canonical,
      metaRobots: pageData.metaRobots,
    };
  } finally {
    await page.close();
  }
}

/**
 * Resolve relative hrefs to absolute URLs and filter to same-origin internal links.
 */
function resolveInternalLinks(
  hrefs: string[],
  currentUrl: string,
  origin: string
): string[] {
  const resolved = new Set<string>();

  for (const href of hrefs) {
    try {
      const absolute = new URL(href, currentUrl);
      // Same origin, no fragment, no query params for dedup
      if (absolute.origin === origin) {
        absolute.hash = '';
        const clean = absolute.href.replace(/\/$/, '');
        resolved.add(clean);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(resolved);
}

function resolveExternalLinks(
  links: Array<{ href: string; rel: string | null; anchor: string | null }>,
  currentUrl: string,
  origin: string
): Array<{ href: string; rel: string | null; anchor: string | null }> {
  const dedup = new Map<
    string,
    { href: string; rel: string | null; anchor: string | null }
  >();

  for (const link of links) {
    try {
      const absolute = new URL(link.href, currentUrl);
      if (absolute.origin === origin) continue;
      if (!['http:', 'https:'].includes(absolute.protocol)) continue;
      absolute.hash = '';
      const href = absolute.href;
      if (!dedup.has(href)) {
        dedup.set(href, {
          href,
          rel: link.rel,
          anchor: link.anchor,
        });
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return Array.from(dedup.values());
}

/**
 * Fetch and parse robots.txt from the target origin.
 */
async function fetchRobotsTxt(origin: string): Promise<RobotsTxtResult> {
  const result: RobotsTxtResult = {
    raw: '',
    sitemapUrls: [],
    disallowedPaths: [],
    aiBotDirectives: {},
  };

  try {
    const response = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return result;

    result.raw = await response.text();
    const lines = result.raw.split('\n');

    let currentAgent = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const [directive, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      if (directive.toLowerCase() === 'user-agent') {
        currentAgent = value;
      } else if (directive.toLowerCase() === 'disallow' && value) {
        if (currentAgent === '*') {
          result.disallowedPaths.push(value);
        }
        // Track AI bot directives
        if (AI_BOTS.some((bot) => currentAgent.toLowerCase() === bot.toLowerCase())) {
          if (!result.aiBotDirectives[currentAgent]) {
            result.aiBotDirectives[currentAgent] = [];
          }
          result.aiBotDirectives[currentAgent].push(`Disallow: ${value}`);
        }
      } else if (directive.toLowerCase() === 'sitemap') {
        result.sitemapUrls.push(value);
      } else if (directive.toLowerCase() === 'allow' && value) {
        if (AI_BOTS.some((bot) => currentAgent.toLowerCase() === bot.toLowerCase())) {
          if (!result.aiBotDirectives[currentAgent]) {
            result.aiBotDirectives[currentAgent] = [];
          }
          result.aiBotDirectives[currentAgent].push(`Allow: ${value}`);
        }
      }
    }
  } catch {
    // robots.txt fetch failed — not a critical error
  }

  return result;
}

/**
 * Create AuditIssue records for crawl problems.
 */
async function createCrawlIssues(
  auditRunId: string,
  results: CrawlResult[],
  robots: RobotsTxtResult,
  pages: { id: string; url: string }[]
) {
  const issues: {
    auditRunId: string;
    auditPageId: string | null;
    stepNumber: number;
    severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
    category: string;
    message: string;
    recommendation: string;
  }[] = [];

  const pageIdMap = new Map(pages.map((p) => [p.url, p.id]));

  for (const r of results) {
    const pageId = pageIdMap.get(r.url) ?? null;

    // HTTP errors
    if (r.httpStatus >= 400) {
      issues.push({
        auditRunId,
        auditPageId: pageId,
        stepNumber: 1,
        severity: r.httpStatus >= 500 ? 'CRITICAL' : 'SERIOUS',
        category: 'HTTP Status',
        message: `Page returned HTTP ${r.httpStatus}`,
        recommendation: r.httpStatus === 404
          ? 'Either restore the page content, set up a 301 redirect to a relevant alternative, or remove internal links pointing to this URL.'
          : r.httpStatus === 403
            ? 'Check server permissions and authentication settings. Ensure Googlebot is not blocked by firewall rules or IP restrictions.'
            : r.httpStatus === 410
              ? 'This page is intentionally removed (410 Gone). Ensure no internal links still point to it.'
              : `Investigate the ${r.httpStatus} server error. Check server logs, hosting resource limits, and application error handlers.`,
      });
    }

    // noindex directive
    if (r.metaRobots?.includes('noindex')) {
      issues.push({
        auditRunId,
        auditPageId: pageId,
        stepNumber: 1,
        severity: 'SERIOUS',
        category: 'Indexability',
        message: 'Page has meta robots noindex directive.',
        recommendation:
          'Remove noindex if this page should appear in search results.',
      });
    }

    // DOM node count — flags performance risk, not crawlability
    // Google does not have a hard crawl limit, but large DOMs degrade CWV and rendering
    if (r.domNodeCount !== null && r.domNodeCount > 3000) {
      issues.push({
        auditRunId,
        auditPageId: pageId,
        stepNumber: 1,
        severity: r.domNodeCount > 5000 ? 'SERIOUS' : 'MODERATE',
        category: 'DOM Size',
        message: `DOM has ${r.domNodeCount.toLocaleString()} nodes (recommended < 3,000). Large DOMs degrade rendering performance, increase memory usage, and slow Core Web Vitals.`,
        recommendation:
          'Virtualize long lists (e.g., react-window), lazy-load off-screen sections with content-visibility: auto, replace nested <div> wrappers with semantic HTML, and defer non-critical DOM elements.',
      });
    } else if (r.domNodeCount !== null && r.domNodeCount > 1500) {
      issues.push({
        auditRunId,
        auditPageId: pageId,
        stepNumber: 1,
        severity: 'MINOR',
        category: 'DOM Size',
        message: `DOM has ${r.domNodeCount.toLocaleString()} nodes. Consider optimizing if Core Web Vitals are affected.`,
        recommendation:
          'Monitor CWV impact. If INP or LCP are poor, reduce DOM complexity by removing unnecessary wrappers and lazy-loading below-fold content.',
      });
    }

    // Missing canonical — only flag on pages likely to have duplicates
    // Not all pages need explicit canonicals; self-referencing is optional on unique pages
    const hasQueryParams = r.url.includes('?');
    const hasTrailingSlashVariant = r.url.endsWith('/') || !r.url.match(/\.[a-z]+$/i);
    if (!r.canonicalUrl && (hasQueryParams || hasTrailingSlashVariant)) {
      issues.push({
        auditRunId,
        auditPageId: pageId,
        stepNumber: 1,
        severity: hasQueryParams ? 'MODERATE' : 'MINOR',
        category: 'Canonicalization',
        message: hasQueryParams
          ? 'Page with URL parameters is missing a canonical tag, risking duplicate content.'
          : 'Page is missing a self-referencing canonical tag.',
        recommendation:
          'Add <link rel="canonical" href="..."> pointing to the preferred version of this URL. This consolidates ranking signals and prevents duplicate content issues.',
      });
    }
  }

  // AI bot directives (site-level issue, not per-page)
  const blockedBots = Object.entries(robots.aiBotDirectives)
    .filter(([, directives]) =>
      directives.some((d) => d.startsWith('Disallow: /'))
    )
    .map(([bot]) => bot);

  if (blockedBots.length > 0) {
    issues.push({
      auditRunId,
      auditPageId: null,
      stepNumber: 1,
      severity: 'MODERATE',
      category: 'AI Bot Access',
      message: `robots.txt blocks AI bots: ${blockedBots.join(', ')}`,
      recommendation:
        'Review whether blocking these AI crawlers is intentional. Blocking them may reduce AI citation visibility.',
    });
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}

/**
 * Normalize user-input domain to a full URL.
 */
function normalizeDomain(input: string): string {
  let url = input.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  // Remove trailing slash
  return url.replace(/\/$/, '');
}
