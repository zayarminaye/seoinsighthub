import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';
import { QUEUE_NAMES } from './config';

export const orchestratorQueue = new Queue(QUEUE_NAMES.orchestrator, {
  connection: redis,
});

export const crawlQueue = new Queue(QUEUE_NAMES.crawl, {
  connection: redis,
});

export const usabilityQueue = new Queue(QUEUE_NAMES.usability, {
  connection: redis,
});

export const relevanceQueue = new Queue(QUEUE_NAMES.relevance, {
  connection: redis,
});

export const authorityQueue = new Queue(QUEUE_NAMES.authority, {
  connection: redis,
});

export const citationsQueue = new Queue(QUEUE_NAMES.citations, {
  connection: redis,
});

export async function enqueueAudit(auditRunId: string) {
  await orchestratorQueue.add(
    'run-audit',
    { auditRunId },
    {
      attempts: 1, // orchestrator doesn't retry — child jobs do
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
}

export interface CitationJobData {
  auditRunId: string;
  seedKeywords: string[];
  competitorDomains: string[];
  queriesPerKeyword: number;
}

export async function enqueueCitationAnalysis(data: CitationJobData) {
  await citationsQueue.add('run-citations', data, {
    attempts: 2,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
