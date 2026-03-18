import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/audits/[id]/citations/rerun/route';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { enqueueCitationAnalysis } from '@/services/queue/queues';
import { resolveGeminiApiKeyForUser } from '@/lib/geminiApiKeys';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(),
}));

vi.mock('@/services/queue/queues', () => ({
  enqueueCitationAnalysis: vi.fn(),
}));

vi.mock('@/lib/geminiApiKeys', () => ({
  resolveGeminiApiKeyForUser: vi.fn(),
}));

describe('POST /api/audits/[id]/citations/rerun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      id: 'u1',
      plan: 'starter',
    } as never);
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    vi.mocked(resolveGeminiApiKeyForUser).mockResolvedValue({
      apiKey: 'k',
      source: 'user',
    });
    vi.mocked(enqueueCitationAnalysis).mockResolvedValue(undefined);
  });

  it('returns 404 when audit not found', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue(null);
    const res = await POST({} as never, { params: Promise.resolve({ id: 'a404' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 when audit citation inputs are missing', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      seedKeywords: [],
      competitorDomains: [],
    } as never);

    const res = await POST({} as never, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { error?: string; code?: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe('MISSING_CITATION_INPUTS');
    expect(body.error).toContain('missing seed keywords');
  });

  it('queues rerun with saved inputs', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
      competitorDomains: ['https://competitor.com'],
    } as never);

    const res = await POST({} as never, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { message?: string; mode?: string };

    expect(res.status).toBe(200);
    expect(body.message).toContain('re-run queued');
    expect(body.mode).toBe('model');
    expect(enqueueCitationAnalysis).toHaveBeenCalledWith({
      auditRunId: 'a1',
      seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
      competitorDomains: ['https://competitor.com'],
      queriesPerKeyword: 4,
    });
  });
});
