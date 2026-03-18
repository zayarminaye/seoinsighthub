import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

// Decay bucket thresholds (in days)
const STAGNANT_DAYS = 180;    // 6 months
const DECLINING_DAYS = 365;   // 1 year
const DECAY_DAYS = 730;       // 2 years

/**
 * Step 12: Content Freshness & Decay Detection
 * Checks last-modified headers, estimates content age,
 * and assigns decay buckets.
 */
export async function runStep12ContentDecay(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: { id: true, url: true },
  });

  if (pages.length === 0) return;

  const issues: {
    auditRunId: string;
    auditPageId: string;
    stepNumber: number;
    severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
    category: string;
    message: string;
    recommendation: string;
  }[] = [];

  const now = Date.now();

  for (const page of pages) {
    try {
      const response = await fetch(page.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });

      // Try to determine content age from headers
      const lastModified = response.headers.get('last-modified');
      const date = response.headers.get('date');

      let contentAgeDays: number | null = null;
      let decayBucket: 'HEALTHY' | 'STAGNANT' | 'DECLINING' | 'DECAY_CANDIDATE' = 'HEALTHY';

      if (lastModified) {
        const lastModDate = new Date(lastModified).getTime();
        if (!isNaN(lastModDate)) {
          contentAgeDays = Math.round((now - lastModDate) / (1000 * 60 * 60 * 24));
        }
      }

      // If no last-modified, check Date header as a rough approximation
      // (only useful if the page doesn't set last-modified, date gives server time)
      if (contentAgeDays === null && date) {
        // Without last-modified, we can't determine content age
        // Mark as unknown — don't create false positives
        contentAgeDays = null;
      }

      // Assign decay bucket
      if (contentAgeDays !== null) {
        if (contentAgeDays >= DECAY_DAYS) {
          decayBucket = 'DECAY_CANDIDATE';
        } else if (contentAgeDays >= DECLINING_DAYS) {
          decayBucket = 'DECLINING';
        } else if (contentAgeDays >= STAGNANT_DAYS) {
          decayBucket = 'STAGNANT';
        } else {
          decayBucket = 'HEALTHY';
        }
      }

      // Update page record
      await prisma.auditPage.update({
        where: { id: page.id },
        data: {
          contentAge: contentAgeDays,
          decayBucket: contentAgeDays !== null ? decayBucket : null,
        },
      });

      // Create issues for aging content
      if (contentAgeDays !== null) {
        if (decayBucket === 'DECAY_CANDIDATE') {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: page.id,
            stepNumber: 12,
            severity: 'SERIOUS',
            category: 'Content Decay',
            message: `Content was last updated ${formatAge(contentAgeDays)} ago. Content older than 2 years is at high risk of losing rankings.`,
            recommendation:
              'Conduct a full content refresh: update statistics, examples, and recommendations. Verify all outbound links still work. Add new sections covering recent developments. Update the publication date.',
          });
        } else if (decayBucket === 'DECLINING') {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: page.id,
            stepNumber: 12,
            severity: 'MODERATE',
            category: 'Content Freshness',
            message: `Content was last updated ${formatAge(contentAgeDays)} ago. Google's Helpful Content system favors regularly updated content.`,
            recommendation:
              'Review and refresh this content. Update outdated information, add new insights, and refresh the publication date. Even minor updates signal freshness to search engines.',
          });
        } else if (decayBucket === 'STAGNANT') {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: page.id,
            stepNumber: 12,
            severity: 'MINOR',
            category: 'Content Freshness',
            message: `Content was last updated ${formatAge(contentAgeDays)} ago. Consider scheduling a review.`,
            recommendation:
              'Add this page to a content review calendar. For time-sensitive topics, update every 3-6 months. For evergreen content, review annually.',
          });
        }
      }

      // Check for missing last-modified header
      if (!lastModified) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 12,
          severity: 'MINOR',
          category: 'Last-Modified Header',
          message: 'Page does not send a Last-Modified header. This prevents browsers and CDNs from using conditional requests.',
          recommendation:
            'Configure your web server to send Last-Modified headers. This enables HTTP 304 responses for unchanged content, reducing bandwidth and improving cache efficiency.',
        });
      }
    } catch (error) {
      console.warn(`Content decay check failed for ${page.url}:`, error);
    }
  }

  // ── Site-level decay summary ────────────────────────────
  const allPages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: { decayBucket: true },
  });

  const decayCounts = {
    DECAY_CANDIDATE: allPages.filter((p) => p.decayBucket === 'DECAY_CANDIDATE').length,
    DECLINING: allPages.filter((p) => p.decayBucket === 'DECLINING').length,
  };

  const totalWithAge = allPages.filter((p) => p.decayBucket !== null).length;
  const decayPct = totalWithAge > 0
    ? Math.round(((decayCounts.DECAY_CANDIDATE + decayCounts.DECLINING) / totalWithAge) * 100)
    : 0;

  if (decayPct >= 40 && totalWithAge >= 5) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: pages[0]!.id,
      stepNumber: 12,
      severity: 'SERIOUS',
      category: 'Site Content Age',
      message: `${decayPct}% of pages have content older than 1 year (${decayCounts.DECLINING} declining, ${decayCounts.DECAY_CANDIDATE} decay candidates).`,
      recommendation:
        'Implement a content refresh program. Prioritize pages that once ranked well but have declined. Start with decay candidates, then declining pages. Use Google Search Console to identify pages losing impressions.',
    });
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}

function formatAge(days: number): string {
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`;
  if (days < 365) return `${Math.round(days / 30)} month${Math.round(days / 30) !== 1 ? 's' : ''}`;
  const years = Math.round(days / 365 * 10) / 10;
  return `${years} year${years !== 1 ? 's' : ''}`;
}
