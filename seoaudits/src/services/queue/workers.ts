import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { QUEUE_NAMES } from './config';
import type { CitationJobData } from './queues';
import {
  type AuditJobData,
  type StepJobData,
  setCurrentStep,
  completeAudit,
  failAudit,
  filterSteps,
  publishProgress,
} from '../audit/orchestrator';

// Step implementations
import { runStep01Crawl } from '../audit/step01-crawl';
import { runStep02CrawlDepth } from '../audit/step02-crawlDepth';
import { runStep03PageSpeed } from '../audit/step03-pageSpeed';
import { runStep04Inp } from '../audit/step04-inp';
import { runStep05Mobile } from '../audit/step05-mobile';
import { runStep06Https } from '../audit/step06-https';
import { runStep07Accessibility } from '../audit/step07-accessibility';
import { runStep08TitleMeta } from '../audit/step08-titleMeta';
import { runStep09Headings } from '../audit/step09-headings';
import { runStep10NlpKeywords } from '../audit/step10-nlpKeywords';
import { runStep11InternalLinks } from '../audit/step11-internalLinks';
import { runStep12ContentDecay } from '../audit/step12-contentDecay';
import { runStep13Schema } from '../audit/step13-schema';
import { runStep14Images } from '../audit/step14-images';
import { runStep15Backlinks } from '../audit/step15-backlinks';
import { runStep16AiCitations } from '../audit/step16-aiCitations';
import { runStep17Eeat } from '../audit/step17-eeat';
import { runStep18BrandMentions } from '../audit/step18-brandMentions';
import { calculateURAScores } from '../audit/scoring';

const STEP_RUNNERS: Record<number, (data: StepJobData) => Promise<void>> = {
  3: runStep03PageSpeed,
  4: runStep04Inp,
  5: runStep05Mobile,
  6: runStep06Https,
  7: runStep07Accessibility,
  8: runStep08TitleMeta,
  9: runStep09Headings,
  10: runStep10NlpKeywords,
  11: runStep11InternalLinks,
  12: runStep12ContentDecay,
  13: runStep13Schema,
  14: runStep14Images,
  15: runStep15Backlinks,
  16: runStep16AiCitations,
  17: runStep17Eeat,
  18: runStep18BrandMentions,
};

/**
 * Orchestrator worker — manages the DAG execution order.
 *
 * Phase A (sequential): Step 1 (Crawl) → Step 2 (Crawl Depth)
 * Phase B (parallel):   Steps 3-7 (Usability, per-URL)
 * Phase C (parallel):   Steps 8-14 (Relevance) — deferred to Phase 2
 * Phase D (parallel):   Step 12 (Content Decay) — deferred to Phase 3
 * Phase E:              Steps 15-18 (Authority) — deferred to Phase 4
 */
async function orchestratorProcessor(job: Job<AuditJobData>) {
  const { auditRunId } = job.data;

  try {
    // Mark as CRAWLING
    await prisma.auditRun.update({
      where: { id: auditRunId },
      data: { status: 'CRAWLING', startedAt: new Date() },
    });

    const audit = await prisma.auditRun.findUniqueOrThrow({
      where: { id: auditRunId },
    });

    // ── Phase A: Crawl + Crawl Depth (sequential) ──────────
    const crawlSteps = filterSteps(audit.selectedSteps, 1, 2);

    if (crawlSteps.includes(1)) {
      await setCurrentStep(auditRunId, 1);
      await runStep01Crawl({ auditRunId, stepNumber: 1 });
    }

    if (crawlSteps.includes(2)) {
      await setCurrentStep(auditRunId, 2);
      await runStep02CrawlDepth({ auditRunId, stepNumber: 2 });
    }

    // Update status to RUNNING for per-URL steps
    await prisma.auditRun.update({
      where: { id: auditRunId },
      data: { status: 'RUNNING' },
    });
    await publishProgress(auditRunId);

    // Get discovered URLs
    const pages = await prisma.auditPage.findMany({
      where: { auditRunId },
      select: { id: true, url: true },
    });

    const urls = pages.map((p) => p.url);

    // ── Phase B: Usability steps 3-7 (per step) ────────────
    const usabilitySteps = filterSteps(audit.selectedSteps, 3, 7);

    for (const stepNum of usabilitySteps) {
      const runner = STEP_RUNNERS[stepNum];
      if (runner) {
        await setCurrentStep(auditRunId, stepNum);
        await runner({ auditRunId, stepNumber: stepNum, urls });
      }
    }

    // ── Phase C: Relevance steps 8-14 ────────────────────
    const relevanceSteps = filterSteps(audit.selectedSteps, 8, 14);

    for (const stepNum of relevanceSteps) {
      const runner = STEP_RUNNERS[stepNum];
      if (runner) {
        await setCurrentStep(auditRunId, stepNum);
        await runner({ auditRunId, stepNumber: stepNum, urls });
      }
    }

    // ── Phase D: Authority steps 15-18 ──────────────────
    const authoritySteps = filterSteps(audit.selectedSteps, 15, 18);

    for (const stepNum of authoritySteps) {
      const runner = STEP_RUNNERS[stepNum];
      if (runner) {
        await setCurrentStep(auditRunId, stepNum);
        await runner({ auditRunId, stepNumber: stepNum, urls });
      }
    }

    // ── Scoring ────────────────────────────────────────────
    const scores = await calculateURAScores(auditRunId);
    await completeAudit(auditRunId, scores);
  } catch (error) {
    console.error(`Audit ${auditRunId} failed:`, error);
    await failAudit(auditRunId);
    throw error;
  }
}

async function citationsProcessor(job: Job<CitationJobData>) {
  const { auditRunId, seedKeywords, competitorDomains, queriesPerKeyword } = job.data;

  const audit = await prisma.auditRun.findUnique({
    where: { id: auditRunId },
    select: { id: true },
  });

  if (!audit) {
    throw new Error(`Audit run not found: ${auditRunId}`);
  }

  const normalizedKeywords = seedKeywords
    .map((k) => k.trim())
    .filter(Boolean);

  const templates = [
    'best {keyword}',
    'how to improve {keyword}',
    '{keyword} checklist',
    '{keyword} examples',
    '{keyword} tools',
  ];

  const queryRows = normalizedKeywords.flatMap((seed) =>
    templates
      .slice(0, Math.max(1, Math.min(queriesPerKeyword, templates.length)))
      .map((t) => ({
        auditRunId,
        seedKeyword: seed,
        queryText: t.replace('{keyword}', seed),
      }))
  );

  await prisma.$transaction(async (tx) => {
    await tx.auditRun.update({
      where: { id: auditRunId },
      data: {
        seedKeywords: normalizedKeywords,
        competitorDomains: [...new Set(competitorDomains.map((d) => d.trim()))],
      },
    });

    await tx.citationQuery.deleteMany({
      where: { auditRunId },
    });

    if (queryRows.length > 0) {
      await tx.citationQuery.createMany({
        data: queryRows,
      });
    }
  });

  await setCurrentStep(auditRunId, 16);
  await runStep16AiCitations({ auditRunId, stepNumber: 16 });
}

/**
 * Start all workers. Call this from a separate worker process.
 */
export function startWorkers() {
  const orchestratorWorker = new Worker(
    QUEUE_NAMES.orchestrator,
    orchestratorProcessor,
    {
      connection: redis,
      concurrency: 3,
    }
  );

  orchestratorWorker.on('failed', (job, err) => {
    console.error(`Orchestrator job ${job?.id} failed:`, err.message);
  });

  orchestratorWorker.on('completed', (job) => {
    console.log(`Orchestrator job ${job.id} completed`);
  });

  const citationsWorker = new Worker(
    QUEUE_NAMES.citations,
    citationsProcessor,
    {
      connection: redis,
      concurrency: 1,
    }
  );

  citationsWorker.on('failed', (job, err) => {
    console.error(`Citations job ${job?.id} failed:`, err.message);
  });

  citationsWorker.on('completed', (job) => {
    console.log(`Citations job ${job.id} completed`);
  });

  console.log('Workers started: orchestrator, citations');

  return { orchestratorWorker, citationsWorker };
}
