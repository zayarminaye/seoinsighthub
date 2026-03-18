import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from '@/app/api/admin/users/[id]/route';
import { requireAdmin } from '@/lib/adminAuth';
import { currentUser } from '@clerk/nextjs/server';
import { updateManagedUser } from '@/lib/adminUsers';
import { logAdminAction } from '@/lib/adminAuditLog';

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
  },
}));

describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when admin check fails', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));

    const req = { json: vi.fn().mockResolvedValue({ plan: 'free' }) } as never;
    const res = await PATCH(req, { params: Promise.resolve({ id: 'u1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('updates user and logs each changed field', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(currentUser).mockResolvedValue({ id: 'admin_1' } as never);
    vi.mocked(updateManagedUser).mockResolvedValue({
      before: { plan: 'free', auditLimit: 5, disabled: false, role: 'user' },
      after: { plan: 'starter', auditLimit: 10, disabled: true, role: 'admin' },
      changed: { plan: true, auditLimit: true, disabled: true, role: true },
      user: { id: 'u1', plan: 'starter', auditLimit: 10 },
    } as never);

    const req = {
      json: vi.fn().mockResolvedValue({
        plan: 'starter',
        auditLimit: 10,
        disabled: true,
        role: 'admin',
      }),
    } as never;

    const res = await PATCH(req, { params: Promise.resolve({ id: 'u1' }) });
    const body = (await res.json()) as { data?: { id: string } };

    expect(res.status).toBe(200);
    expect(body.data?.id).toBe('u1');
    expect(updateManagedUser).toHaveBeenCalledWith({
      userId: 'u1',
      adminId: 'admin_1',
      plan: 'starter',
      auditLimit: 10,
      disabled: true,
      role: 'admin',
    });
    expect(logAdminAction).toHaveBeenCalledTimes(4);
  });

  it('returns 400 when attempting to revoke own admin role', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(currentUser).mockResolvedValue({ id: 'admin_1' } as never);
    vi.mocked(updateManagedUser).mockRejectedValue(new Error('CANNOT_REVOKE_SELF_ADMIN'));

    const req = {
      json: vi.fn().mockResolvedValue({
        role: 'user',
      }),
    } as never;

    const res = await PATCH(req, { params: Promise.resolve({ id: 'u1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('cannot revoke your own admin role');
  });
});
