import { chromium, type Browser } from 'playwright';
import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { WORKER_CONFIG } from '../queue/config';

/**
 * Step 5: Mobile-Friendliness
 * Uses Playwright with mobile viewport to check:
 * - Viewport meta tag
 * - Tap target sizes (>= 48x48 CSS px)
 * - Font size (>= 14px body text per modern WCAG/Google guidance)
 * - Content wider than viewport (horizontal scroll)
 */
export async function runStep05Mobile(data: StepJobData): Promise<void> {
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
    selector?: string;
    recommendation: string;
  }[] = [];

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 }, // iPhone-like viewport
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true,
    });

    for (const pageRecord of pages) {
      try {
        const page = await context.newPage();
        await page.goto(pageRecord.url, {
          waitUntil: 'domcontentloaded',
          timeout: WORKER_CONFIG.playwright.pageTimeoutMs,
        });

        const mobileData = await page.evaluate(() => {
          // Check viewport meta tag
          const viewportMeta = document.querySelector(
            'meta[name="viewport"]'
          );
          const hasViewport = !!viewportMeta;
          const viewportContent =
            viewportMeta?.getAttribute('content') ?? '';

          // Check for horizontal scroll
          const bodyWidth = document.body.scrollWidth;
          const viewportWidth = window.innerWidth;
          const hasHorizontalScroll = bodyWidth > viewportWidth + 10;

          // Check tap targets (interactive elements)
          const interactiveSelectors = 'a, button, input, select, textarea, [role="button"]';
          const interactiveElements = document.querySelectorAll(interactiveSelectors);
          let smallTapTargets = 0;
          const totalTapTargets = interactiveElements.length;

          interactiveElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (
              rect.width > 0 &&
              rect.height > 0 &&
              (rect.width < 48 || rect.height < 48)
            ) {
              smallTapTargets++;
            }
          });

          // Check minimum font size
          const textElements = document.querySelectorAll(
            'p, span, li, td, th, label, a'
          );
          let smallFontCount = 0;
          const totalTextElements = textElements.length;

          textElements.forEach((el) => {
            const fontSize = parseFloat(
              window.getComputedStyle(el).fontSize
            );
            if (fontSize < 14 && el.textContent && el.textContent.trim().length > 0) {
              smallFontCount++;
            }
          });

          return {
            hasViewport,
            viewportContent,
            hasHorizontalScroll,
            bodyWidth,
            viewportWidth,
            smallTapTargets,
            totalTapTargets,
            smallFontCount,
            totalTextElements,
          };
        });

        // Determine mobile-friendly status
        const isMobileFriendly =
          mobileData.hasViewport &&
          !mobileData.hasHorizontalScroll &&
          (mobileData.totalTapTargets === 0 ||
            mobileData.smallTapTargets / mobileData.totalTapTargets < 0.2) &&
          (mobileData.totalTextElements === 0 ||
            mobileData.smallFontCount / mobileData.totalTextElements < 0.1);

        await prisma.auditPage.update({
          where: { id: pageRecord.id },
          data: { mobileFriendly: isMobileFriendly },
        });

        // Create issues
        if (!mobileData.hasViewport) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 5,
            severity: 'CRITICAL',
            category: 'Viewport',
            message: 'Page is missing the viewport meta tag.',
            selector: 'head',
            recommendation:
              'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
          });
        }

        if (mobileData.hasHorizontalScroll) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 5,
            severity: 'SERIOUS',
            category: 'Content Width',
            message: `Content (${mobileData.bodyWidth}px) is wider than viewport (${mobileData.viewportWidth}px).`,
            recommendation:
              'Set max-width: 100% and box-sizing: border-box on images and containers. Check for fixed-width tables, iframes, or absolute-positioned elements causing overflow.',
          });
        }

        if (mobileData.smallTapTargets > 0) {
          const pct = Math.round(
            (mobileData.smallTapTargets / mobileData.totalTapTargets) * 100
          );
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 5,
            severity: pct > 30 ? 'SERIOUS' : 'MODERATE',
            category: 'Tap Targets',
            message: `${mobileData.smallTapTargets} of ${mobileData.totalTapTargets} tap targets (${pct}%) are smaller than 48x48px.`,
            recommendation:
              'Set min-height: 48px and min-width: 48px on interactive elements. Add padding instead of increasing font size. Ensure at least 8px spacing between adjacent targets (per WCAG 2.5.8).',
          });
        }

        if (mobileData.smallFontCount > 0) {
          const pct = Math.round(
            (mobileData.smallFontCount / mobileData.totalTextElements) * 100
          );
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 5,
            severity: pct > 20 ? 'SERIOUS' : 'MODERATE',
            category: 'Font Size',
            message: `${mobileData.smallFontCount} text elements (${pct}%) have font size below 14px.`,
            recommendation:
              'Use a minimum of 16px for body text and 14px for secondary text. Set font-size: 100% on <html> and use rem units for scalability.',
          });
        }

        await page.close();
      } catch (error) {
        console.error(`Mobile check failed for ${pageRecord.url}:`, error);
      }
    }

    await context.close();
  } finally {
    if (browser) await browser.close();
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
