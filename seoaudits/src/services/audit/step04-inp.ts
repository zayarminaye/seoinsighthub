import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

/**
 * Step 4: INP Deep Dive
 * Analyzes INP data already collected by Step 3 (PSI API).
 * Creates detailed issues for pages with poor INP.
 * INP thresholds: < 200ms = GOOD, 200-500ms = NEEDS_IMPROVEMENT, > 500ms = POOR
 */
export async function runStep04Inp(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      inpValue: true,
      inpRating: true,
      details: true,
    },
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

  for (const page of pages) {
    const inpMs = page.inpValue;
    if (inpMs === null) continue;

    if (inpMs >= 500) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 4,
        severity: 'CRITICAL',
        category: 'INP',
        message: `INP is ${Math.round(inpMs)}ms (poor — target: < 200ms).`,
        recommendation:
          'Break up JavaScript tasks longer than 50ms using scheduler.yield() or setTimeout. Move heavy computation to Web Workers. Defer third-party scripts and use requestIdleCallback for analytics.',
      });
    } else if (inpMs >= 200) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 4,
        severity: 'SERIOUS',
        category: 'INP',
        message: `INP is ${Math.round(inpMs)}ms (needs improvement — target: < 200ms).`,
        recommendation:
          'Audit event listeners for costly re-renders or layout thrashing. Use passive: true on scroll/touch listeners. Debounce input handlers and yield to the main thread between interactions using scheduler.yield().',
      });
    }

    // TBT is a diagnostic lab metric (not a Core Web Vital) but strongly correlates with INP
    const details = page.details as { psi?: { tbtMs?: number } } | null;
    const tbtMs = details?.psi?.tbtMs;

    if (tbtMs !== null && tbtMs !== undefined && tbtMs > 300) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 4,
        severity: tbtMs > 600 ? 'SERIOUS' : 'MODERATE',
        category: 'TBT',
        message: `Total Blocking Time is ${Math.round(tbtMs)}ms (target: < 300ms). TBT is a diagnostic metric that correlates with poor INP.`,
        recommendation:
          'Reduce main-thread blocking: code-split large bundles with dynamic import(), tree-shake unused dependencies, defer third-party scripts with async attribute, and move non-UI work to Web Workers.',
      });
    }
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
