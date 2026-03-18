import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

interface PageWithLinks {
  id: string;
  url: string;
  details: { linkGraph?: string[] } | null;
}

/**
 * Step 2: Crawl Depth Analysis
 * Calculates minimum click-depth from homepage to every discovered URL using BFS.
 * Flags pages deeper than 3 clicks and orphan pages.
 */
export async function runStep02CrawlDepth(data: StepJobData): Promise<void> {
  const audit = await prisma.auditRun.findUniqueOrThrow({
    where: { id: data.auditRunId },
    select: { targetDomain: true },
  });

  const pages = (await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: { id: true, url: true, details: true },
  })) as PageWithLinks[];

  if (pages.length === 0) return;

  // Build URL → page ID map
  const urlToId = new Map<string, string>();
  for (const page of pages) {
    urlToId.set(page.url, page.id);
  }

  // Build adjacency list from link graph stored in Step 1 details
  const adjacency = new Map<string, string[]>();
  for (const page of pages) {
    const links = (page.details as { linkGraph?: string[] })?.linkGraph ?? [];
    // Filter to only known internal pages
    const validLinks = links.filter((link) => urlToId.has(link));
    adjacency.set(page.url, validLinks);
  }

  // Find homepage URL
  const homepageUrl = findHomepage(audit.targetDomain, pages);

  // BFS from homepage
  const depthMap = new Map<string, number>();

  if (homepageUrl) {
    const queue: { url: string; depth: number }[] = [
      { url: homepageUrl, depth: 0 },
    ];
    depthMap.set(homepageUrl, 0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current.url) ?? [];

      for (const neighbor of neighbors) {
        if (!depthMap.has(neighbor)) {
          const nextDepth = current.depth + 1;
          depthMap.set(neighbor, nextDepth);
          queue.push({ url: neighbor, depth: nextDepth });
        }
      }
    }
  }

  // Update crawl depth for all pages and collect issues
  const issues: {
    auditRunId: string;
    auditPageId: string;
    stepNumber: number;
    severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
    category: string;
    message: string;
    recommendation: string;
  }[] = [];

  for (const page of pages) {
    const depth = depthMap.get(page.url) ?? null;

    await prisma.auditPage.update({
      where: { id: page.id },
      data: { crawlDepth: depth },
    });

    if (depth === null) {
      // Orphan page — unreachable from homepage
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 2,
        severity: 'SERIOUS',
        category: 'Orphan Page',
        message: 'Page is not reachable from the homepage via internal links.',
        recommendation:
          'Add internal links from other pages to make this page discoverable by crawlers.',
      });
    } else if (depth > 3) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 2,
        severity: depth > 5 ? 'SERIOUS' : 'MODERATE',
        category: 'Crawl Depth',
        message: `Page is ${depth} clicks from homepage (recommended: ≤ 3).`,
        recommendation:
          'Flatten site architecture by adding links from higher-level pages.',
      });
    }
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}

/**
 * Find the homepage URL from the list of crawled pages.
 */
function findHomepage(
  targetDomain: string,
  pages: PageWithLinks[]
): string | null {
  // Normalize domain
  let domain = targetDomain.trim();
  if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
    domain = `https://${domain}`;
  }
  domain = domain.replace(/\/$/, '');

  // Try exact match first
  const exact = pages.find((p) => p.url === domain || p.url === domain + '/');
  if (exact) return exact.url;

  // Try origin match
  try {
    const origin = new URL(domain).origin;
    const originMatch = pages.find(
      (p) => p.url === origin || p.url === origin + '/'
    );
    if (originMatch) return originMatch.url;
  } catch {
    // invalid URL
  }

  // Fallback: first page (typically the homepage from BFS crawl)
  return pages[0]?.url ?? null;
}
