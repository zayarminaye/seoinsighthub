import { chromium } from 'playwright';
import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { WORKER_CONFIG } from '../queue/config';

interface HeadingInfo {
  tag: string;
  text: string;
  level: number;
  fontSizePx: number;
}

/**
 * Step 9: Heading Structure & Semantic HTML
 * Analyzes heading hierarchy, H1 usage, and heading level consistency.
 */
export async function runStep09Headings(data: StepJobData): Promise<void> {
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

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seoaudits.app)',
      viewport: { width: 1920, height: 1080 },
    });

    // Sample pages (up to 20 for heading analysis)
    const sampled = pages.slice(0, 20);

    for (const pageRecord of sampled) {
      try {
        const page = await context.newPage();
        await page.goto(pageRecord.url, {
          waitUntil: 'domcontentloaded',
          timeout: WORKER_CONFIG.playwright.pageTimeoutMs,
        });

        // Extract all headings with computed font sizes
        const headings: HeadingInfo[] = await page.evaluate(() => {
          const results: { tag: string; text: string; level: number; fontSizePx: number }[] = [];
          const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          elements.forEach((el) => {
            const tag = el.tagName.toLowerCase();
            const style = window.getComputedStyle(el);
            results.push({
              tag,
              text: (el.textContent ?? '').trim().slice(0, 200),
              level: parseInt(tag.charAt(1), 10),
              fontSizePx: parseFloat(style.fontSize),
            });
          });
          return results;
        });

        await page.close();

        // ── H1 checks ──────────────────────────────────────
        const h1s = headings.filter((h) => h.level === 1);

        if (h1s.length === 0) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 9,
            severity: 'SERIOUS',
            category: 'H1 Tag',
            message: 'Page is missing an H1 heading.',
            recommendation:
              'Add exactly one H1 tag that describes the main topic of the page. The H1 should contain the primary keyword and match the page\'s search intent.',
          });
        } else if (h1s.length > 1) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 9,
            severity: 'MODERATE',
            category: 'H1 Tag',
            message: `Page has ${h1s.length} H1 tags. Best practice is one H1 per page.`,
            recommendation:
              'Keep one primary H1 for the page topic. Demote other H1s to H2 or lower to create a clear content hierarchy.',
          });
        }

        // H1 visual prominence — should be the largest heading
        if (h1s.length > 0 && headings.length > 1) {
          const h1FontSize = Math.max(...h1s.map((h) => h.fontSizePx));
          const otherMaxFontSize = Math.max(
            ...headings.filter((h) => h.level > 1).map((h) => h.fontSizePx),
            0
          );

          const isLargest = h1FontSize >= otherMaxFontSize;

          // Update page record with heading data
          await prisma.auditPage.update({
            where: { id: pageRecord.id },
            data: {
              h1Count: h1s.length,
              h1FontSizePx: h1FontSize,
              h1IsLargestHeading: isLargest,
            },
          });

          if (!isLargest) {
            issues.push({
              auditRunId: data.auditRunId,
              auditPageId: pageRecord.id,
              stepNumber: 9,
              severity: 'MINOR',
              category: 'H1 Prominence',
              message: `H1 (${Math.round(h1FontSize)}px) is smaller than another heading (${Math.round(otherMaxFontSize)}px). Visual hierarchy should match semantic hierarchy.`,
              recommendation:
                'Style the H1 to be visually larger than all other headings. This reinforces the semantic structure for both users and search engines.',
            });
          }
        } else if (h1s.length > 0) {
          await prisma.auditPage.update({
            where: { id: pageRecord.id },
            data: {
              h1Count: h1s.length,
              h1FontSizePx: h1s[0]!.fontSizePx,
              h1IsLargestHeading: true,
            },
          });
        }

        // ── Heading hierarchy (skipped levels) ─────────────
        if (headings.length > 0) {
          const levels = headings.map((h) => h.level);
          const skippedLevels: string[] = [];

          for (let i = 1; i < levels.length; i++) {
            const current = levels[i]!;
            const previous = levels[i - 1]!;
            // Going deeper: should only increase by 1
            if (current > previous + 1) {
              skippedLevels.push(`H${previous} → H${current}`);
            }
          }

          if (skippedLevels.length > 0) {
            issues.push({
              auditRunId: data.auditRunId,
              auditPageId: pageRecord.id,
              stepNumber: 9,
              severity: 'MODERATE',
              category: 'Heading Hierarchy',
              message: `Heading levels are skipped: ${skippedLevels.slice(0, 3).join(', ')}${skippedLevels.length > 3 ? ` (+${skippedLevels.length - 3} more)` : ''}.`,
              recommendation:
                'Use headings in sequential order (H1 → H2 → H3) without skipping levels. This creates a logical document outline that screen readers and search engines rely on.',
            });
          }
        }

        // ── Empty headings ─────────────────────────────────
        const emptyHeadings = headings.filter((h) => h.text.length === 0);
        if (emptyHeadings.length > 0) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 9,
            severity: 'MODERATE',
            category: 'Empty Headings',
            message: `${emptyHeadings.length} empty heading tag${emptyHeadings.length > 1 ? 's' : ''} found (${emptyHeadings.map((h) => h.tag.toUpperCase()).join(', ')}).`,
            recommendation:
              'Remove empty heading tags or add descriptive text. Empty headings create noise in the document outline and confuse assistive technology.',
          });
        }
      } catch (error) {
        console.warn(`Heading analysis failed for ${pageRecord.url}:`, error);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
