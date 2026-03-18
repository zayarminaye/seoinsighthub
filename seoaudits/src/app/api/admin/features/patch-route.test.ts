import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from '@/app/api/admin/features/[name]/route';
import { requireAdmin } from '@/lib/adminAuth';
import { currentUser } from '@clerk/nextjs/server';
import { setFeatureFlag } from '@/lib/featureFlags';
import { logAdminAction } from '@/lib/adminAuditLog';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({
  setFeatureFlag: vi.fn(),
}));

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminAction: vi.fn(),
}));

describe('PATCH /api/admin/features/[name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when admin check fails', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));

    const req = { json: vi.fn().mockResolvedValue({ enabled: true }) } as never;
    const res = await PATCH(req, { params: Promise.resolve({ name: 'export.pdf' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 401 when no current user is available', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(currentUser).mockResolvedValue(null);

    const req = { json: vi.fn().mockResolvedValue({ enabled: true }) } as never;
    const res = await PATCH(req, { params: Promise.resolve({ name: 'export.pdf' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 on invalid payload', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);

    const req = { json: vi.fn().mockResolvedValue({ enabled: 'yes' }) } as never;
    const res = await PATCH(req, { params: Promise.resolve({ name: 'export.pdf' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid input');
  });

  it('updates feature and logs action', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(currentUser).mockResolvedValue({ id: 'admin_1' } as never);
    vi.mocked(setFeatureFlag).mockResolvedValue({
      enabled: false,
      plans: ['starter', 'pro'],
      description: 'PDF export',
    } as never);

    const req = {
      json: vi.fn().mockResolvedValue({
        enabled: false,
        plans: ['starter', 'pro'],
        description: 'PDF export',
      }),
    } as never;
    const res = await PATCH(req, { params: Promise.resolve({ name: 'export.pdf' }) });
    const body = (await res.json()) as { data?: { enabled: boolean } };

    expect(res.status).toBe(200);
    expect(body.data?.enabled).toBe(false);
    expect(setFeatureFlag).toHaveBeenCalledWith(
      'export.pdf',
      {
        enabled: false,
        plans: ['starter', 'pro'],
        description: 'PDF export',
      },
      'admin_1'
    );
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });
});
