import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/audits/[id]/citations/route';
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
    citationQuery: {
      findMany: vi.fn(),
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

describe('POST /api/audits/[id]/citations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      id: 'u1',
      plan: 'starter',
    } as never);
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      status: 'COMPLETED',
    } as never);
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    vi.mocked(enqueueCitationAnalysis).mockResolvedValue(undefined);
    vi.mocked(resolveGeminiApiKeyForUser).mockResolvedValue({
      apiKey: 'k',
      source: 'user',
    });
  });

  it('returns 404 when audit is not found', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue(null);

    const req = {
      json: vi.fn().mockResolvedValue({
        seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
        competitorDomains: ['https://competitor.com'],
      }),
    } as never;
    const res = await POST(req, { params: Promise.resolve({ id: 'a404' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Audit not found');
  });

  it('returns 403 when citation feature is disabled for plan', async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);

    const req = {
      json: vi.fn().mockResolvedValue({
        seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
        competitorDomains: ['https://competitor.com'],
      }),
    } as never;
    const res = await POST(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toContain('not enabled');
    expect(enqueueCitationAnalysis).not.toHaveBeenCalled();
  });

  it('blocks private/local competitor domains', async () => {
    const req = {
      json: vi.fn().mockResolvedValue({
        seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
        competitorDomains: ['localhost'],
      }),
    } as never;
    const res = await POST(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('public websites');
    expect(enqueueCitationAnalysis).not.toHaveBeenCalled();
  });

  it('normalizes competitor domains without protocol and queues analysis', async () => {
    const req = {
      json: vi.fn().mockResolvedValue({
        seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
        competitorDomains: ['competitor.com'],
        queriesPerKeyword: 3,
      }),
    } as never;
    const res = await POST(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as {
      message?: string;
      queryCount?: number;
      mode?: string;
      disclaimer?: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.message).toBe('Citation analysis queued');
    expect(body.queryCount).toBe(15);
    expect(body.mode).toBe('model');
    expect(body.disclaimer).toBeNull();
    expect(enqueueCitationAnalysis).toHaveBeenCalledWith({
      auditRunId: 'a1',
      seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
      competitorDomains: ['https://competitor.com'],
      queriesPerKeyword: 3,
    });
  });

  it('returns heuristic mode when no Gemini key is configured', async () => {
    vi.mocked(resolveGeminiApiKeyForUser).mockResolvedValue({
      apiKey: null,
      source: 'none',
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        seedKeywords: ['k1', 'k2', 'k3', 'k4', 'k5'],
        competitorDomains: ['competitor.com'],
        queriesPerKeyword: 2,
      }),
    } as never;
    const res = await POST(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { mode?: string; disclaimer?: string | null };

    expect(res.status).toBe(200);
    expect(body.mode).toBe('heuristic');
    expect(body.disclaimer).toContain('No Gemini API key');
  });
});
