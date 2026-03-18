import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getUser } from '@/app/api/admin/users/[id]/route';
import { GET as getUserAudits } from '@/app/api/admin/users/[id]/audits/route';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
}));

vi.mock('@/lib/adminUsers', () => ({
  updateManagedUser: vi.fn(),
}));

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminAction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    auditRun: {
      findMany: vi.fn(),
    },
  },
}));

describe('GET /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when user does not exist', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await getUser({} as never, { params: Promise.resolve({ id: 'u404' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('User not found');
  });

  it('returns user details when found', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      _count: { auditRuns: 7 },
    } as never);

    const res = await getUser({} as never, { params: Promise.resolve({ id: 'u1' }) });
    const body = (await res.json()) as { data?: { id: string } };

    expect(res.status).toBe(200);
    expect(body.data?.id).toBe('u1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      include: {
        _count: {
          select: {
            auditRuns: true,
          },
        },
      },
    });
  });
});

describe('GET /api/admin/users/[id]/audits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when admin check fails', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));

    const res = await getUserAudits({} as never, { params: Promise.resolve({ id: 'u1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns audits list for user', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.auditRun.findMany).mockResolvedValue([
      { id: 'a1', targetDomain: 'https://example.com', status: 'COMPLETED' },
    ] as never);

    const res = await getUserAudits({} as never, { params: Promise.resolve({ id: 'u1' }) });
    const body = (await res.json()) as { data: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(prisma.auditRun.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        targetDomain: true,
        status: true,
        totalPages: true,
        createdAt: true,
        completedAt: true,
        uraScoreOverall: true,
      },
    });
    expect(body.data[0]?.id).toBe('a1');
  });
});
