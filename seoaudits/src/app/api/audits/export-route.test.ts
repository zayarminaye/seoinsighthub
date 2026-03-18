import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/audits/[id]/export/[format]/route';
import { requireUser } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getPlanTier } from '@/lib/planTiers';
import { prisma } from '@/lib/prisma';
import { isFeatureEnabled } from '@/lib/featureFlags';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: vi.fn(),
  EXPORT_RATE_LIMIT: { maxRequests: 20, windowMs: 60 * 60_000 },
}));

vi.mock('@/lib/planTiers', () => ({
  getPlanTier: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    citationQuery: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(),
}));

vi.mock('@/lib/securityLogger', () => ({
  logSecurityEvent: vi.fn(),
}));

describe('GET /api/audits/[id]/export/[format]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1', plan: 'starter' } as never);
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      resetMs: 1000,
    });
    vi.mocked(getPlanTier).mockReturnValue({
      pdfExport: true,
      dataExport: true,
      auditsPerMonth: 20,
      maxPagesPerAudit: 100,
      availableSteps: [1, 2, 3],
      label: 'Starter',
      name: 'starter',
    });
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  });

  it('returns 429 when export rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      success: false,
      remaining: 0,
      resetMs: 10_000,
    });

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'pages-csv' }),
    });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(429);
    expect(body.error).toContain('Export rate limit reached');
  });

  it('returns 403 when pdf export is not allowed by plan', async () => {
    vi.mocked(getPlanTier).mockReturnValue({
      pdfExport: false,
      dataExport: true,
      auditsPerMonth: 5,
      maxPagesPerAudit: 25,
      availableSteps: [1, 2, 3],
      label: 'Free',
      name: 'free',
    });

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'pdf' }),
    });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toContain('PDF export is not available');
  });

  it('returns 403 when pdf export flag is disabled', async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (name: string) => {
      if (name === 'export.pdf') return false;
      return true;
    });

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'pdf' }),
    });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toContain('disabled by admin');
  });

  it('returns 403 when json export flag is disabled', async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (name: string) => {
      if (name === 'export.json') return false;
      return true;
    });

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'json' }),
    });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toContain('JSON export is currently disabled');
  });

  it('returns 403 when csv/json export is not allowed by plan', async () => {
    vi.mocked(getPlanTier).mockReturnValue({
      pdfExport: true,
      dataExport: false,
      auditsPerMonth: 5,
      maxPagesPerAudit: 25,
      availableSteps: [1, 2, 3],
      label: 'Free',
      name: 'free',
    });

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'pages-csv' }),
    });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toContain('Data export is not available');
  });

  it('returns 404 when audit is not found', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue(null);

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'missing', format: 'pages-csv' }),
    });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Audit not found');
  });

  it('returns pages CSV content for valid request', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      targetDomain: 'https://example.com',
      status: 'COMPLETED',
      selectedSteps: [1, 2, 3],
      pages: [
        {
          url: 'https://example.com',
          httpStatus: 200,
          crawlDepth: 1,
          performanceScore: 80,
          inpValue: 120,
          inpRating: 'GOOD',
          mobileFriendly: true,
          accessibilityScore: 90,
          domNodeCount: 700,
          titleTag: 'Home',
          titleLength: 4,
          metaDescription: 'Desc',
          metaDescriptionLength: 4,
          h1Count: 1,
          wordCount: 200,
          internalLinksInbound: 3,
          internalLinksOutbound: 4,
          contentAge: 12,
          decayBucket: 'HEALTHY',
          eeatScore: 70,
          hasAuthorByline: true,
          details: { psi: { lcpMs: 2000 } },
        },
      ],
      issues: [],
    } as never);

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'pages-csv' }),
    });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('example.com-pages.csv');
    expect(text).toContain('URL,HTTP Status,Crawl Depth');
    expect(text).toContain('https://example.com,200,1,80');
  });

  it('filters issues CSV to selected steps only', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      targetDomain: 'https://example.com',
      status: 'COMPLETED',
      selectedSteps: [1],
      pages: [],
      issues: [
        {
          severity: 'SERIOUS',
          stepNumber: 1,
          category: 'HTTP Status',
          message: 'Broken page',
          selector: null,
          recommendation: 'Fix it',
          auditPage: { url: 'https://example.com/a', titleTag: 'A', httpStatus: 404 },
        },
        {
          severity: 'MODERATE',
          stepNumber: 15,
          category: 'Missing Social Profiles',
          message: 'No social links',
          selector: null,
          recommendation: 'Add sameAs',
          auditPage: { url: 'https://example.com/b', titleTag: 'B', httpStatus: 200 },
        },
      ],
    } as never);

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'issues-csv' }),
    });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('Severity,Step,Step Name');
    expect(text).toContain('SERIOUS,1');
    expect(text).not.toContain(',15,');
    expect(text).not.toContain('Missing Social Profiles');
  });

  it('returns 400 for invalid export format', async () => {
    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'xml' }),
    });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid export format');
  });

  it('returns ai citations history csv content for valid request', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      targetDomain: 'https://example.com',
      status: 'COMPLETED',
      selectedSteps: [16],
      pages: [],
      issues: [],
    } as never);
    vi.mocked(prisma.auditRun.findMany).mockResolvedValue([
      { id: 'a1', completedAt: new Date('2026-03-18T10:00:00.000Z') },
    ] as never);
    vi.mocked(prisma.citationQuery.findMany).mockResolvedValue([
      { auditRunId: 'a1', results: [{ id: 'r1' }, { id: 'r2' }] },
      { auditRunId: 'a1', results: [] },
    ] as never);

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'ai-citations-history-csv' }),
    });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(text).toContain('Audit Run ID,Completed At (UTC),Attempted Queries');
    expect(text).toContain('a1,2026-03-18T10:00:00.000Z,2,2,0,100');
  });

  it('includes ai citation history in json export', async () => {
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      targetDomain: 'https://example.com',
      status: 'COMPLETED',
      selectedSteps: [16],
      pages: [],
      issues: [],
    } as never);
    vi.mocked(prisma.citationQuery.findMany)
      .mockResolvedValueOnce([
        { queryText: 'q1', seedKeyword: 'k1', results: [] },
      ] as never)
      .mockResolvedValueOnce([
        { auditRunId: 'a1', results: [{ id: 'r1' }] },
      ] as never);
    vi.mocked(prisma.auditRun.findMany).mockResolvedValue([
      { id: 'a1', completedAt: new Date('2026-03-18T10:00:00.000Z') },
    ] as never);

    const res = await GET({} as never, {
      params: Promise.resolve({ id: 'a1', format: 'json' }),
    });
    const body = (await res.json()) as { aiCitationHistory?: unknown[] };

    expect(res.status).toBe(200);
    expect(Array.isArray(body.aiCitationHistory)).toBe(true);
    expect(body.aiCitationHistory?.length).toBe(1);
  });
});
