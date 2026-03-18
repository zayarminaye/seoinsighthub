import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/audits/[id]/route';
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
  },
}));

describe('GET /api/audits/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth response when requireUser throws Response', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const res = await GET({} as never, { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when audit does not exist for user', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue(null);

    const res = await GET({} as never, { params: Promise.resolve({ id: 'a404' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Audit not found');
  });

  it('returns audit details with counts', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      _count: { pages: 10, issues: 3 },
    } as never);

    const res = await GET({} as never, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { id: string; _count: { pages: number } };

    expect(res.status).toBe(200);
    expect(body.id).toBe('a1');
    expect(body._count.pages).toBe(10);
    expect(prisma.auditRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', userId: 'u1' },
      include: {
        _count: {
          select: {
            pages: true,
            issues: true,
          },
        },
      },
    });
  });
});
