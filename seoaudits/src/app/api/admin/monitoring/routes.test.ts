import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { GET as getOverview } from '@/app/api/admin/monitoring/overview/route';
import { GET as getQueues } from '@/app/api/admin/monitoring/queues/route';
import { GET as getAudits } from '@/app/api/admin/monitoring/audits/route';
import { GET as getAICitations } from '@/app/api/admin/monitoring/ai-citations/route';

const queueGetJobCounts = vi.fn();
const queueClose = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    getJobCounts = queueGetJobCounts;
    close = queueClose;
  },
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    citationQuery: {
      findMany: vi.fn(),
    },
    auditIssue: {
      findMany: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
  },
}));

describe('admin monitoring routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    queueGetJobCounts.mockResolvedValue({
      active: 1,
      waiting: 2,
      delayed: 0,
      failed: 0,
      completed: 3,
    });
    queueClose.mockResolvedValue(undefined);
  });

  it('overview returns aggregated stats', async () => {
    vi.mocked(prisma.auditRun.count)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5);
    vi.mocked(prisma.user.count).mockResolvedValue(10);

    const res = await getOverview();
    const body = (await res.json()) as {
      data: { activeAudits: number; failedAudits24h: number; completedAudits24h: number; usersCount: number; queues: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(body.data.activeAudits).toBe(2);
    expect(body.data.failedAudits24h).toBe(1);
    expect(body.data.completedAudits24h).toBe(5);
    expect(body.data.usersCount).toBe(10);
    expect(Array.isArray(body.data.queues)).toBe(true);
  });

  it('queues route returns queue counts by queue name', async () => {
    const res = await getQueues();
    const body = (await res.json()) as {
      data: Record<string, { active: number; waiting: number; failed: number }>;
    };

    expect(res.status).toBe(200);
    expect(Object.keys(body.data).length).toBeGreaterThan(0);
  });

  it('audits route returns active and failed lists', async () => {
    vi.mocked(prisma.auditRun.findMany)
      .mockResolvedValueOnce([
        { id: 'a1', userId: 'u1', targetDomain: 'https://ex.com', status: 'RUNNING', currentStepName: 'Step 3', createdAt: new Date() },
      ] as never)
      .mockResolvedValueOnce([
        { id: 'a2', userId: 'u1', targetDomain: 'https://ex.com', status: 'FAILED', createdAt: new Date(), completedAt: null },
      ] as never);

    const res = await getAudits();
    const body = (await res.json()) as {
      data: { active: Array<{ id: string }>; failed: Array<{ id: string }> };
    };

    expect(res.status).toBe(200);
    expect(body.data.active[0]?.id).toBe('a1');
    expect(body.data.failed[0]?.id).toBe('a2');
  });

  it('returns 403 when admin guard rejects', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));
    const res = await getOverview();
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('ai-citations route returns step 16 telemetry', async () => {
    vi.mocked(prisma.auditRun.findMany).mockResolvedValueOnce([
      { id: 'a1', createdAt: new Date() },
      { id: 'a2', createdAt: new Date() },
    ] as never);

    vi.mocked(prisma.citationQuery.findMany).mockResolvedValueOnce([
      {
        auditRunId: 'a1',
        results: [{ createdAt: new Date('2026-03-18T10:00:00.000Z') }, { createdAt: new Date('2026-03-18T10:00:30.000Z') }],
      },
      {
        auditRunId: 'a2',
        results: [],
      },
    ] as never);

    vi.mocked(prisma.auditIssue.findMany).mockResolvedValueOnce([
      { auditRunId: 'a2' },
    ] as never);

    const res = await getAICitations();
    const body = (await res.json()) as {
      data: {
        auditsWithStep16: number;
        attemptedQueries: number;
        successfulQueries: number;
        successRate: number;
        quotaHitAudits: number;
        quotaHitRate: number;
      };
    };

    expect(res.status).toBe(200);
    expect(body.data.auditsWithStep16).toBe(2);
    expect(body.data.attemptedQueries).toBe(2);
    expect(body.data.successfulQueries).toBe(2);
    expect(body.data.successRate).toBe(100);
    expect(body.data.quotaHitAudits).toBe(1);
    expect(body.data.quotaHitRate).toBe(50);
  });
});
