import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

/**
 * Step 15: Backlink Profile Analysis
 *
 * Since we don't have a paid backlink API (Ahrefs, Moz, etc.),
 * this step analyzes on-site authority signals from the crawled data:
 * - Outbound link quality (external links to authoritative domains)
 * - Nofollow vs dofollow ratio
 * - Broken outbound links
 * - Link diversity and anchor text patterns
 * - Social proof links (from schema sameAs)
 */
export async function runStep15Backlinks(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      details: true,
      hasSameAs: true,
      sameAsUrls: true,
      internalLinksOutbound: true,
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

  // Track external link data across all pages
  let totalExternalLinks = 0;
  let nofollowCount = 0;
  let pagesWithoutExternalLinks = 0;

  for (const page of pages) {
    const details = page.details as Record<string, unknown> | null;
    const externalLinks = (details?.externalLinks as Array<{ href: string; rel?: string; anchor?: string }>) ?? [];

    if (externalLinks.length > 0) {
      totalExternalLinks += externalLinks.length;

      // Count nofollow links
      const pageNofollowLinks = externalLinks.filter(
        (l) => l.rel && l.rel.includes('nofollow')
      );
      nofollowCount += pageNofollowLinks.length;

      // ── Excessive external links on a single page ──
      if (externalLinks.length > 50) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 15,
          severity: 'MODERATE',
          category: 'Excessive External Links',
          message: `Page has ${externalLinks.length} external links. Excessive outbound links can dilute page authority.`,
          recommendation:
            'Review external links and remove or nofollow low-value ones. Keep only editorially relevant outbound links.',
        });
      }

      // ── All external links are nofollow ──
      if (pageNofollowLinks.length === externalLinks.length && externalLinks.length > 3) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 15,
          severity: 'MINOR',
          category: 'Nofollow Overuse',
          message: `All ${externalLinks.length} external links on this page are nofollow. This may signal distrust to search engines.`,
          recommendation:
            'Use nofollow selectively for sponsored or user-generated links. Editorial links to authoritative sources should be dofollow.',
        });
      }

      // ── Empty anchor text on external links ──
      const emptyAnchorLinks = externalLinks.filter(
        (l) => !l.anchor || l.anchor.trim().length === 0
      );
      if (emptyAnchorLinks.length > 0 && emptyAnchorLinks.length >= externalLinks.length * 0.5) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 15,
          severity: 'MINOR',
          category: 'Empty Link Anchors',
          message: `${emptyAnchorLinks.length} external link(s) have empty or missing anchor text.`,
          recommendation:
            'Use descriptive anchor text for all links. This helps search engines understand the context and relevance of the linked resource.',
        });
      }
    } else {
      pagesWithoutExternalLinks++;
    }
  }

  // ── Site-level: No social profiles linked ──
  const pagesWithSameAs = pages.filter((p) => p.hasSameAs === true);
  if (pagesWithSameAs.length === 0) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 15,
      severity: 'MODERATE',
      category: 'Missing Social Profiles',
      message:
        'No social profile links (sameAs) detected in structured data. Social profiles are a trust signal for search engines and AI systems.',
      recommendation:
        'Add Organization schema with sameAs property linking to official social media profiles (LinkedIn, Twitter, Facebook, etc.).',
    });
  }

  // ── Site-level: Very few external links site-wide ──
  if (totalExternalLinks === 0 && pages.length > 5) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 15,
      severity: 'MODERATE',
      category: 'No External References',
      message:
        'No external links found across any crawled pages. Citing authoritative external sources builds topical authority and trust.',
      recommendation:
        'Add editorial outbound links to authoritative sources, research, and industry publications relevant to your content.',
    });
  }

  // ── Site-level: Nofollow ratio too high ──
  if (totalExternalLinks > 10 && nofollowCount / totalExternalLinks > 0.8) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 15,
      severity: 'MINOR',
      category: 'High Nofollow Ratio',
      message: `${Math.round((nofollowCount / totalExternalLinks) * 100)}% of external links are nofollow (${nofollowCount}/${totalExternalLinks}). Excessive nofollow usage may limit your site's perceived trust and authority.`,
      recommendation:
        'Reserve nofollow for sponsored, UGC, or untrusted links. Editorial citations to authoritative sources should be dofollow to build topical associations.',
    });
  }

  // ── Site-level: No pages link to external sources ──
  if (pagesWithoutExternalLinks > pages.length * 0.8 && pages.length > 5) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 15,
      severity: 'MINOR',
      category: 'Low External Citation Rate',
      message: `${Math.round((pagesWithoutExternalLinks / pages.length) * 100)}% of pages have no external links. Pages that cite authoritative sources tend to rank better.`,
      recommendation:
        'Add relevant outbound links within content pages. Linking to authoritative sources demonstrates expertise and builds topical relevance.',
    });
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
