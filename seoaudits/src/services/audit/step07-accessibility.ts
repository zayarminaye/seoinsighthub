import { chromium, type Browser } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { WORKER_CONFIG } from '../queue/config';

type AxeSeverity = 'critical' | 'serious' | 'moderate' | 'minor';

const SEVERITY_MAP: Record<AxeSeverity, 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR'> = {
  critical: 'CRITICAL',
  serious: 'SERIOUS',
  moderate: 'MODERATE',
  minor: 'MINOR',
};

/**
 * Step 7: Accessibility
 * Runs axe-core via Playwright on each page.
 * Flags WCAG 2.1 AA violations and calculates an accessibility score.
 */
export async function runStep07Accessibility(data: StepJobData): Promise<void> {
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
      viewport: { width: 1920, height: 1080 },
    });

    for (const pageRecord of pages) {
      try {
        const page = await context.newPage();
        await page.goto(pageRecord.url, {
          waitUntil: 'domcontentloaded',
          timeout: WORKER_CONFIG.playwright.pageTimeoutMs,
        });

        // Run axe-core with WCAG 2.1 AA tags
        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        // Weighted scoring: critical violations weigh 3x, serious 2x, moderate 1x, minor 0.5x
        const IMPACT_WEIGHT: Record<string, number> = {
          critical: 3,
          serious: 2,
          moderate: 1,
          minor: 0.5,
        };

        const passPoints = axeResults.passes.length;
        const violationPoints = axeResults.violations.reduce((sum, v) => {
          const weight = IMPACT_WEIGHT[v.impact ?? 'moderate'] ?? 1;
          return sum + weight * v.nodes.length;
        }, 0);
        const incompletePoints = axeResults.incomplete.length * 0.5;

        const totalPoints = passPoints + violationPoints + incompletePoints;
        const passRate =
          totalPoints > 0
            ? Math.round(Math.max(0, (passPoints / totalPoints) * 100))
            : 100;

        await prisma.auditPage.update({
          where: { id: pageRecord.id },
          data: { accessibilityScore: passRate },
        });

        // Create issues from violations
        for (const violation of axeResults.violations) {
          const severity =
            SEVERITY_MAP[violation.impact as AxeSeverity] ?? 'MODERATE';

          // Get first affected node's selector for reference
          const selector =
            violation.nodes[0]?.target?.join(' > ') ?? undefined;

          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 7,
            severity,
            category: 'Accessibility',
            message: `${violation.id}: ${violation.description} (${violation.nodes.length} instance${violation.nodes.length > 1 ? 's' : ''}).`,
            selector,
            recommendation:
              violation.helpUrl
                ? `${violation.help}. See: ${violation.helpUrl}`
                : violation.help,
          });
        }

        await page.close();
      } catch (error) {
        console.error(
          `Accessibility check failed for ${pageRecord.url}:`,
          error
        );
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
