import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/logs/route';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminAuditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('GET /api/admin/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('returns logs with bounded limit', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.adminAuditLog.count).mockResolvedValue(1);
    vi.mocked(prisma.adminAuditLog.findMany).mockResolvedValue([
      { id: 'l1', action: 'user.plan.changed' },
    ] as never);

    const req = {
      nextUrl: { searchParams: new URLSearchParams([['limit', '999']]) },
    } as never;
    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 201,
      })
    );
    expect(body.data[0]?.id).toBe('l1');
  });

  it('applies action/admin filters and cursor pagination', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.adminAuditLog.count).mockResolvedValue(2);
    vi.mocked(prisma.adminAuditLog.findMany).mockResolvedValue([
      { id: 'l2', action: 'feature.toggled' },
      { id: 'l1', action: 'feature.toggled' },
    ] as never);

    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['limit', '1'],
          ['action', 'feature.toggled'],
          ['adminId', 'admin_1'],
          ['cursor', 'l3'],
        ]),
      },
    } as never;
    const res = await GET(req);
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
      nextCursor?: string;
    };

    expect(res.status).toBe(200);
    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: { action: 'feature.toggled', adminId: 'admin_1' },
      orderBy: { createdAt: 'desc' },
      take: 2,
      cursor: { id: 'l3' },
      skip: 1,
    });
    expect(body.data).toEqual([{ id: 'l2', action: 'feature.toggled' }]);
    expect(body.nextCursor).toBe('l2');
  });

  it('supports page-based pagination', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.adminAuditLog.count).mockResolvedValue(25);
    vi.mocked(prisma.adminAuditLog.findMany).mockResolvedValue([
      { id: 'l11', action: 'user.updated' },
    ] as never);

    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['page', '2'],
          ['limit', '10'],
        ]),
      },
    } as never;
    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ id: string }>; totalCount: number };

    expect(res.status).toBe(200);
    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(body.totalCount).toBe(25);
    expect(body.data[0]?.id).toBe('l11');
  });

  it('returns empty logs when AdminAuditLog table is missing', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(prisma.adminAuditLog.findMany).mockRejectedValue({ code: 'P2021' });
    vi.mocked(prisma.adminAuditLog.count).mockRejectedValue({ code: 'P2021' });

    const req = {
      nextUrl: { searchParams: new URLSearchParams() },
    } as never;
    const res = await GET(req);
    const body = (await res.json()) as { data: unknown[]; tableMissing: boolean };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.tableMissing).toBe(true);
  });
});
