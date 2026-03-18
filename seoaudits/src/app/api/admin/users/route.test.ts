import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/users/route';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when admin check fails', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));

    const req = {
      nextUrl: { searchParams: new URLSearchParams() },
    } as never;
    const res = await GET(req);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns paginated users and nextCursor when more records exist', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u3', email: '3@example.com', _count: { auditRuns: 3 } },
      { id: 'u2', email: '2@example.com', _count: { auditRuns: 2 } },
      { id: 'u1', email: '1@example.com', _count: { auditRuns: 1 } },
    ] as never);

    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['limit', '2'],
          ['plan', 'starter'],
          ['search', 'example'],
        ]),
      },
    } as never;
    const res = await GET(req);
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
      nextCursor?: string;
    };

    expect(res.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        plan: 'starter',
        OR: [
          { email: { contains: 'example', mode: 'insensitive' } },
          { name: { contains: 'example', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: {
        _count: {
          select: {
            auditRuns: true,
          },
        },
      },
    });
    expect(body.data).toHaveLength(2);
    expect(body.data[0]?.id).toBe('u3');
    expect(body.nextCursor).toBe('u2');
  });
});
