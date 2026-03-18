import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { STEP_NAMES } from '../queue/config';

export interface AuditJobData {
  auditRunId: string;
}

export interface StepJobData {
  auditRunId: string;
  stepNumber: number;
  url?: string;
  urls?: string[];
}

/**
 * Publish progress update via Redis pub/sub.
 * The SSE endpoint subscribes to this channel.
 */
export async function publishProgress(auditRunId: string) {
  const audit = await prisma.auditRun.findUnique({
    where: { id: auditRunId },
    select: {
      status: true,
      currentStep: true,
      currentStepName: true,
      totalPages: true,
      completedPages: true,
    },
  });

  if (!audit) return;

  const rawRatio =
    audit.totalPages > 0 ? audit.completedPages / audit.totalPages : 0;
  const percentComplete = Math.round(Math.min(1, Math.max(0, rawRatio)) * 100);

  await redis.publish(
    `audit:${auditRunId}:progress`,
    JSON.stringify({
      auditId: auditRunId,
      status: audit.status,
      currentStep: audit.currentStep,
      currentStepName: audit.currentStepName,
      urlsProcessed: audit.completedPages,
      urlsTotal: audit.totalPages,
      percentComplete,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Update the audit run's current step and publish progress.
 */
export async function setCurrentStep(auditRunId: string, stepNumber: number) {
  await prisma.auditRun.update({
    where: { id: auditRunId },
    data: {
      currentStep: stepNumber,
      currentStepName: STEP_NAMES[stepNumber] ?? `Step ${stepNumber}`,
      // Reset per-step page progress so SSE does not accumulate beyond 100%.
      completedPages: 0,
    },
  });
  await publishProgress(auditRunId);
}

/**
 * Increment completed pages counter and publish progress.
 */
export async function incrementCompletedPages(
  auditRunId: string,
  count: number = 1
) {
  await prisma.auditRun.update({
    where: { id: auditRunId },
    data: { completedPages: { increment: count } },
  });
  await publishProgress(auditRunId);
}

/**
 * Mark audit as complete with final URA scores.
 */
export async function completeAudit(
  auditRunId: string,
  scores: {
    uraScoreU: number | null;
    uraScoreR: number | null;
    uraScoreA: number | null;
    uraScoreOverall: number | null;
  }
) {
  const current = await prisma.auditRun.findUnique({
    where: { id: auditRunId },
    select: { totalPages: true },
  });

  await prisma.auditRun.update({
    where: { id: auditRunId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedPages: current?.totalPages ?? 0,
      ...scores,
    },
  });
  await publishProgress(auditRunId);
}

/**
 * Mark audit as failed.
 */
export async function failAudit(auditRunId: string) {
  await prisma.auditRun.update({
    where: { id: auditRunId },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
    },
  });
  await publishProgress(auditRunId);
}

/**
 * Get the list of selected steps that fall within a range.
 */
export function filterSteps(
  selectedSteps: number[],
  min: number,
  max: number
): number[] {
  return selectedSteps.filter((s) => s >= min && s <= max);
}
