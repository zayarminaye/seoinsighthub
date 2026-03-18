import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/audits/route';
import { requireUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getPlanTier } from '@/lib/planTiers';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { prisma } from '@/lib/prisma';
import { enqueueAudit } from '@/services/queue/queues';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: vi.fn(),
  AUDIT_CREATE_RATE_LIMIT: { maxRequests: 10, windowMs: 60 * 60_000 },
}));

vi.mock('@/lib/planTiers', () => ({
  getPlanTier: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/services/queue/queues', () => ({
  enqueueAudit: vi.fn(),
}));

vi.mock('@/lib/securityLogger', () => ({
  logSecurityEvent: vi.fn(),
}));

describe('POST /api/audits enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      id: 'u1',
      plan: 'free',
      auditLimit: 5,
    } as never);
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: true,
      remaining: 9,
      resetMs: 1000,
    });
    vi.mocked(getPlanTier).mockReturnValue({
      name: 'free',
      label: 'Free',
      auditsPerMonth: 5,
      maxPagesPerAudit: 25,
      availableSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
      pdfExport: true,
      dataExport: true,
    });
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    vi.mocked(prisma.auditRun.count).mockResolvedValue(0);
    vi.mocked(prisma.auditRun.create).mockResolvedValue({
      id: 'a1',
      status: 'QUEUED',
    } as never);
    vi.mocked(enqueueAudit).mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));
  });

  it('blocks private/local target domains server-side', async () => {
    const req = {
      json: vi.fn().mockResolvedValue({
        domain: 'https://10.0.0.5',
        selectedSteps: [1],
        maxPages: 10,
        seedKeywords: [],
        competitorDomains: [],
      }),
    } as never;

    const res = await POST(req);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('public website');
    expect(prisma.auditRun.create).not.toHaveBeenCalled();
  });

  it('blocks unreachable websites', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network'))
    );

    const req = {
      json: vi.fn().mockResolvedValue({
        domain: 'https://example.com',
        selectedSteps: [1],
        maxPages: 10,
        seedKeywords: [],
        competitorDomains: [],
      }),
    } as never;

    const res = await POST(req);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('not reachable');
    expect(prisma.auditRun.create).not.toHaveBeenCalled();
  });

  it('blocks creation when all selected steps are disabled by flags', async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (name: string) => {
      if (name === 'audit.max-pages-override') return false;
      return false;
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        domain: 'https://example.com',
        selectedSteps: [1, 8, 15],
        maxPages: 10,
        seedKeywords: [],
        competitorDomains: [],
      }),
    } as never;

    const res = await POST(req);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('No selected steps are currently enabled');
    expect(prisma.auditRun.create).not.toHaveBeenCalled();
  });

  it('blocks creation when monthly quota is reached', async () => {
    vi.mocked(prisma.auditRun.count).mockResolvedValue(5);

    const req = {
      json: vi.fn().mockResolvedValue({
        domain: 'https://example.com',
        selectedSteps: [1],
        maxPages: 10,
        seedKeywords: [],
        competitorDomains: [],
      }),
    } as never;

    const res = await POST(req);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(429);
    expect(body.error).toContain('Monthly audit limit reached (5)');
    expect(prisma.auditRun.create).not.toHaveBeenCalled();
  });

  it('applies max-pages override and step filtering before create', async () => {
    vi.mocked(getPlanTier).mockReturnValue({
      name: 'free',
      label: 'Free',
      auditsPerMonth: 5,
      maxPagesPerAudit: 25,
      availableSteps: [1, 8, 15],
      pdfExport: true,
      dataExport: true,
    });
    vi.mocked(isFeatureEnabled).mockImplementation(async (name: string) => {
      if (name === 'audit.max-pages-override') return true;
      if (name === 'audit.steps.usability') return true;
      if (name === 'audit.steps.relevance') return false;
      if (name === 'audit.steps.authority') return false;
      return false;
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        domain: 'https://example.com',
        selectedSteps: [1, 8, 15],
        maxPages: 100,
        seedKeywords: ['seo audit'],
        competitorDomains: ['https://competitor.com'],
      }),
    } as never;

    const res = await POST(req);
    const body = (await res.json()) as { auditId?: string; status?: string };

    expect(res.status).toBe(201);
    expect(body.auditId).toBe('a1');
    expect(prisma.auditRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        selectedSteps: [1],
        maxPages: 100,
      }),
    });
    expect(enqueueAudit).toHaveBeenCalledWith('a1');
  });

  it('accepts domain and competitor domains without protocol by normalizing to https', async () => {
    const req = {
      json: vi.fn().mockResolvedValue({
        domain: 'example.com',
        selectedSteps: [1],
        maxPages: 10,
        seedKeywords: [],
        competitorDomains: ['competitor.com'],
      }),
    } as never;

    const res = await POST(req);
    const body = (await res.json()) as { auditId?: string };

    expect(res.status).toBe(201);
    expect(body.auditId).toBe('a1');
    expect(prisma.auditRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetDomain: 'https://example.com',
        competitorDomains: ['https://competitor.com'],
      }),
    });
  });

  it('removes step 16 when audit.citation-analysis is disabled', async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (name: string) => {
      if (name === 'audit.max-pages-override') return false;
      if (name === 'audit.steps.usability') return true;
      if (name === 'audit.steps.relevance') return true;
      if (name === 'audit.steps.authority') return true;
      if (name === 'audit.citation-analysis') return false;
      return false;
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        domain: 'https://example.com',
        selectedSteps: [15, 16, 17],
        maxPages: 10,
        seedKeywords: [],
        competitorDomains: [],
      }),
    } as never;

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prisma.auditRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        selectedSteps: [15, 17],
      }),
    });
  });
});
