import { chromium } from 'playwright';
import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { WORKER_CONFIG } from '../queue/config';

interface ImageInfo {
  src: string;
  alt: string | null;
  hasWidth: boolean;
  hasHeight: boolean;
  hasLazyLoad: boolean;
  isAboveFold: boolean;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  fileExtension: string;
}

/**
 * Step 14: Image Optimization
 * Checks for missing alt text, missing dimensions, lazy-load usage,
 * oversized images, and modern format adoption.
 */
export async function runStep14Images(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: { id: true, url: true },
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

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seoaudits.app)',
      viewport: { width: 1920, height: 1080 },
    });

    // Sample up to 15 pages
    const sampled = pages.slice(0, 15);
    let siteImageCount = 0;
    let siteMissingAlt = 0;
    let siteLegacyFormat = 0;

    for (const pageRecord of sampled) {
      try {
        const page = await context.newPage();
        await page.goto(pageRecord.url, {
          waitUntil: 'load',
          timeout: WORKER_CONFIG.playwright.pageTimeoutMs,
        });

        // Wait briefly for lazy-loaded images
        await page.waitForTimeout(1000);

        const images: ImageInfo[] = await page.evaluate(() => {
          const results: ImageInfo[] = [];
          const viewportHeight = window.innerHeight;

          document.querySelectorAll('img').forEach((img) => {
            const rect = img.getBoundingClientRect();
            const src = img.src || img.getAttribute('data-src') || '';

            // Skip tracking pixels and tiny images
            if (img.naturalWidth < 10 && img.naturalHeight < 10) return;
            if (!src) return;

            const ext = src.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';

            results.push({
              src: src.slice(0, 200),
              alt: img.getAttribute('alt'),
              hasWidth: img.hasAttribute('width') || img.style.width !== '',
              hasHeight: img.hasAttribute('height') || img.style.height !== '',
              hasLazyLoad: img.loading === 'lazy' || img.hasAttribute('data-src'),
              isAboveFold: rect.top < viewportHeight,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              displayWidth: rect.width,
              displayHeight: rect.height,
              fileExtension: ext,
            });
          });

          return results;
        });

        await page.close();

        if (images.length === 0) continue;

        siteImageCount += images.length;

        // ── Missing alt text ──────────────────────────────
        const missingAlt = images.filter((img) => img.alt === null || img.alt === '');
        siteMissingAlt += missingAlt.length;

        if (missingAlt.length > 0) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 14,
            severity: missingAlt.length > 5 ? 'SERIOUS' : 'MODERATE',
            category: 'Missing Alt Text',
            message: `${missingAlt.length} of ${images.length} images are missing alt text. Alt text is essential for accessibility and image SEO.`,
            recommendation:
              'Add descriptive alt text to all images that convey meaning. Use 5-15 words describing what the image shows. Decorative images should use alt="" (empty, not missing).',
          });
        }

        // ── Missing dimensions ────────────────────────────
        const missingDimensions = images.filter((img) => !img.hasWidth || !img.hasHeight);
        if (missingDimensions.length > 0) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 14,
            severity: 'MODERATE',
            category: 'Image Dimensions',
            message: `${missingDimensions.length} images are missing explicit width/height attributes. This causes layout shifts (CLS) when images load.`,
            recommendation:
              'Add width and height attributes to all <img> tags, or use CSS aspect-ratio. This reserves space during page load and prevents Cumulative Layout Shift.',
          });
        }

        // ── Legacy image formats ──────────────────────────
        const LEGACY_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'bmp'];
        const legacyImages = images.filter((img) =>
          LEGACY_FORMATS.includes(img.fileExtension)
        );
        siteLegacyFormat += legacyImages.length;

        if (legacyImages.length > 3) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 14,
            severity: 'MODERATE',
            category: 'Image Format',
            message: `${legacyImages.length} images use legacy formats (JPEG/PNG). Modern formats like WebP and AVIF offer 25-50% better compression.`,
            recommendation:
              'Convert images to WebP (95% browser support) or AVIF (85% support) using tools like Sharp, Squoosh, or your CDN\'s automatic format conversion. Use <picture> with <source> for fallbacks.',
          });
        }

        // ── Oversized images ──────────────────────────────
        const oversized = images.filter(
          (img) =>
            img.naturalWidth > 0 &&
            img.displayWidth > 0 &&
            img.naturalWidth > img.displayWidth * 2
        );

        if (oversized.length > 0) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 14,
            severity: 'MODERATE',
            category: 'Oversized Images',
            message: `${oversized.length} images are served at significantly larger resolutions than displayed. This wastes bandwidth and slows page load.`,
            recommendation:
              'Resize images to match their display size (at 2x for retina). Use srcset and sizes attributes for responsive images, or configure your CDN for automatic resizing.',
          });
        }

        // ── Above-fold images with lazy-load ──────────────
        const lazyAboveFold = images.filter(
          (img) => img.isAboveFold && img.hasLazyLoad
        );
        if (lazyAboveFold.length > 0) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 14,
            severity: 'MODERATE',
            category: 'Lazy Loading',
            message: `${lazyAboveFold.length} above-the-fold image${lazyAboveFold.length > 1 ? 's are' : ' is'} set to lazy-load. This delays the LCP element and hurts Core Web Vitals.`,
            recommendation:
              'Remove loading="lazy" from above-fold images, especially the hero/LCP image. Add fetchpriority="high" to the LCP image instead. Only lazy-load images below the fold.',
          });
        }

        // ── Below-fold images without lazy-load ───────────
        const eagerBelowFold = images.filter(
          (img) => !img.isAboveFold && !img.hasLazyLoad
        );
        if (eagerBelowFold.length > 3) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 14,
            severity: 'MINOR',
            category: 'Lazy Loading',
            message: `${eagerBelowFold.length} below-fold images are not lazy-loaded. Loading all images upfront wastes bandwidth.`,
            recommendation:
              'Add loading="lazy" to below-fold images. This defers loading until the user scrolls near them, reducing initial page weight and improving LCP.',
          });
        }
      } catch (error) {
        console.warn(`Image analysis failed for ${pageRecord.url}:`, error);
      }
    }

    await context.close();

    // ── Site-level alt text summary ───────────────────────
    if (siteImageCount > 0 && siteMissingAlt > 0) {
      const missingPct = Math.round((siteMissingAlt / siteImageCount) * 100);
      if (missingPct >= 30) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: null,
          stepNumber: 14,
          severity: 'SERIOUS',
          category: 'Alt Text Coverage',
          message: `${missingPct}% of images across the site (${siteMissingAlt}/${siteImageCount}) are missing alt text. This is an accessibility violation (WCAG 1.1.1) and hurts image search visibility.`,
          recommendation:
            'Implement an alt text policy: all informational images must have descriptive alt text. Use your CMS to flag images without alt text during content creation.',
        });
      }
    }

    // ── Site-level format modernization ───────────────────
    if (siteImageCount > 0 && siteLegacyFormat > 0) {
      const legacyPct = Math.round((siteLegacyFormat / siteImageCount) * 100);
      if (legacyPct >= 50) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: null,
          stepNumber: 14,
          severity: 'MODERATE',
          category: 'Image Modernization',
          message: `${legacyPct}% of site images use legacy formats. Switching to WebP/AVIF could reduce image payload by 25-50%.`,
          recommendation:
            'Set up automatic image format conversion via your CDN (Cloudflare, Imgix, Cloudinary) or build pipeline (Sharp). Serve WebP with JPEG/PNG fallback using the <picture> element.',
        });
      }
    }
  } finally {
    await browser.close();
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
