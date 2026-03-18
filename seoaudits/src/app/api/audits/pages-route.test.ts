import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/audits/[id]/pages/route';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      findFirst: vi.fn(),
    },
    auditPage: {
      findMany: vi.fn(),
    },
  },
}));

describe('GET /api/audits/[id]/pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({ id: 'a1' } as never);
    vi.mocked(prisma.auditPage.findMany).mockResolvedValue([
      { id: 'p1' },
    ] as never);
  });

  it('applies stepNumber filter through related issues', async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['stepNumber', '9'],
        ]),
      },
    } as never;

    const res = await GET(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { data: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(body.data[0]?.id).toBe('p1');
    expect(prisma.auditPage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          auditRunId: 'a1',
          issues: {
            some: { stepNumber: 9 },
          },
        }),
      })
    );
  });

  it('returns 400 for invalid query params', async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['limit', '0'],
        ]),
      },
    } as never;

    const res = await GET(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid query parameters');
  });
});
