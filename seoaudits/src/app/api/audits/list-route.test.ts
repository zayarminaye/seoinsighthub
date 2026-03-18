import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/audits/route';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      findMany: vi.fn(),
    },
  },
}));

describe('GET /api/audits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.auditRun.findMany).mockResolvedValue([
      { id: 'a2', status: 'COMPLETED' },
      { id: 'a1', status: 'RUNNING' },
    ] as never);
  });

  it('returns 400 for invalid query params', async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['status', 'INVALID'],
        ]),
      },
    } as never;

    const res = await GET(req);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid query parameters');
  });

  it('returns audits list', async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams(),
      },
    } as never;

    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]?.id).toBe('a2');
    expect(prisma.auditRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
      })
    );
  });
});
