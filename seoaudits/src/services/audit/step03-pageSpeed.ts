import type { StepJobData } from './orchestrator';
import { incrementCompletedPages } from './orchestrator';
import { prisma } from '@/lib/prisma';

interface PSIResult {
  lighthouseResult?: {
    categories?: {
      performance?: { score: number | null };
    };
    audits?: {
      'interaction-to-next-paint'?: {
        numericValue?: number;
        displayValue?: string;
      };
      'largest-contentful-paint'?: { numericValue?: number };
      'cumulative-layout-shift'?: { numericValue?: number };
      'total-blocking-time'?: { numericValue?: number };
      'speed-index'?: { numericValue?: number };
      'first-contentful-paint'?: { numericValue?: number };
    };
  };
  loadingExperience?: {
    metrics?: {
      INTERACTION_TO_NEXT_PAINT?: {
        percentile: number;
        category: string;
      };
    };
  };
}

/**
 * Step 3: Page Speed & Core Web Vitals
 * Calls Google PageSpeed Insights API per URL.
 * Stores performance score and CWV metrics.
 */
export async function runStep03PageSpeed(data: StepJobData): Promise<void> {
  const apiKey = process.env.GOOGLE_PSI_API_KEY;

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

  // Process URLs with rate limiting (PSI API has quotas)
  for (const page of pages) {
    try {
      const psiData = await fetchPSI(page.url, apiKey);

      const perfScore =
        psiData.lighthouseResult?.categories?.performance?.score;
      const perfScoreNormalized =
        perfScore !== null && perfScore !== undefined
          ? Math.round(perfScore * 100)
          : null;

      // Extract CWV metrics from Lighthouse
      const audits = psiData.lighthouseResult?.audits;
      const lcpMs = audits?.['largest-contentful-paint']?.numericValue ?? null;
      const clsValue = audits?.['cumulative-layout-shift']?.numericValue ?? null;
      const tbtMs = audits?.['total-blocking-time']?.numericValue ?? null;
      const fcpMs = audits?.['first-contentful-paint']?.numericValue ?? null;
      const siMs = audits?.['speed-index']?.numericValue ?? null;

      // INP from Lighthouse lab data
      const inpLabMs =
        audits?.['interaction-to-next-paint']?.numericValue ?? null;

      // INP from CrUX field data (preferred when available)
      const cruxInp =
        psiData.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT;
      const inpFieldMs = cruxInp?.percentile ?? null;
      const inpCategory = cruxInp?.category ?? null;

      // Use field INP if available, otherwise lab
      const inpMs = inpFieldMs ?? inpLabMs;

      await prisma.auditPage.update({
        where: { id: page.id },
        data: {
          performanceScore: perfScoreNormalized,
          inpValue: inpMs,
          inpRating: inpMs !== null
            ? inpMs < 200
              ? 'GOOD'
              : inpMs < 500
                ? 'NEEDS_IMPROVEMENT'
                : 'POOR'
            : null,
          details: {
            psi: {
              lcpMs,
              clsValue,
              tbtMs,
              fcpMs,
              siMs,
              inpLabMs,
              inpFieldMs,
              inpCategory,
            },
          },
        },
      });

      // Flag poor performance
      if (perfScoreNormalized !== null && perfScoreNormalized < 50) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 3,
          severity: 'CRITICAL',
          category: 'Page Speed',
          message: `Performance score is ${perfScoreNormalized}/100.`,
          recommendation:
            'Convert images to WebP/AVIF, defer non-critical JavaScript with async/defer attributes, enable server-side caching (Cache-Control headers), and inline critical CSS to eliminate render-blocking resources.',
        });
      } else if (perfScoreNormalized !== null && perfScoreNormalized < 80) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 3,
          severity: 'SERIOUS',
          category: 'Page Speed',
          message: `Performance score is ${perfScoreNormalized}/100.`,
          recommendation:
            'Focus on LCP (preload hero images, optimize server response time) and TBT (split long JavaScript tasks, tree-shake unused code). Run Lighthouse for page-specific diagnostics.',
        });
      }

      // Flag poor LCP
      if (lcpMs !== null && lcpMs > 2500) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 3,
          severity: lcpMs > 4000 ? 'CRITICAL' : 'SERIOUS',
          category: 'LCP',
          message: `Largest Contentful Paint is ${Math.round(lcpMs)}ms (target: < 2,500ms).`,
          recommendation:
            'Identify the LCP element (usually hero image or large heading). Preload it with <link rel="preload">, serve images in WebP/AVIF format, use a CDN, and ensure server TTFB is under 800ms.',
        });
      }

      // Flag high CLS
      if (clsValue !== null && clsValue > 0.1) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 3,
          severity: clsValue > 0.25 ? 'SERIOUS' : 'MODERATE',
          category: 'CLS',
          message: `Cumulative Layout Shift is ${clsValue.toFixed(3)} (target: < 0.1).`,
          recommendation:
            'Set explicit width and height attributes on all <img> and <iframe> elements. Use CSS aspect-ratio for responsive containers. Avoid injecting banners, ads, or dynamic content above existing visible content.',
        });
      }

      await incrementCompletedPages(data.auditRunId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`PSI skipped for ${page.url}: ${msg}`);
    }

    // Rate limit: ~1 request per second for free tier
    await sleep(1200);
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}

/**
 * Fetch PageSpeed Insights data for a URL.
 */
async function fetchPSI(
  url: string,
  apiKey: string | undefined
): Promise<PSIResult> {
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
  });

  // Only send key if it's a real API key (not placeholder)
  if (apiKey && apiKey !== 'REPLACE_ME') {
    params.set('key', apiKey);
  }

  const response = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
    {
      signal: AbortSignal.timeout(60_000), // PSI analysis takes longer than regular page loads
    }
  );

  if (!response.ok) {
    throw new Error(`PSI API returned ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<PSIResult>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
