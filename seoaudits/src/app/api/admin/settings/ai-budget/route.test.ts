import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from '@/app/api/admin/settings/ai-budget/route';
import { requireAdmin } from '@/lib/adminAuth';
import { getActingUserId } from '@/lib/actingUser';
import { logAdminAction } from '@/lib/adminAuditLog';
import {
  getGeminiMaxQueriesPerAudit,
  setGeminiMaxQueriesPerAudit,
} from '@/lib/adminSettings';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/actingUser', () => ({
  getActingUserId: vi.fn(),
}));

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminAction: vi.fn(),
}));

vi.mock('@/lib/adminSettings', () => ({
  getGeminiMaxQueriesPerAudit: vi.fn(),
  setGeminiMaxQueriesPerAudit: vi.fn(),
}));

describe('GET/PATCH /api/admin/settings/ai-budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
  });

  it('returns configured budget', async () => {
    vi.mocked(getGeminiMaxQueriesPerAudit).mockResolvedValue(10);
    const res = await GET();
    const body = (await res.json()) as { data?: { maxQueries: number } };
    expect(res.status).toBe(200);
    expect(body.data?.maxQueries).toBe(10);
  });

  it('returns 403 on forbidden admin', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('updates budget', async () => {
    vi.mocked(getActingUserId).mockResolvedValue('admin_1');
    vi.mocked(setGeminiMaxQueriesPerAudit).mockResolvedValue(8);
    vi.mocked(logAdminAction).mockResolvedValue(undefined);

    const req = {
      json: vi.fn().mockResolvedValue({ maxQueries: 8 }),
    } as never;
    const res = await PATCH(req);
    const body = (await res.json()) as { data?: { maxQueries: number } };

    expect(res.status).toBe(200);
    expect(body.data?.maxQueries).toBe(8);
    expect(setGeminiMaxQueriesPerAudit).toHaveBeenCalledWith('admin_1', 8);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });
});
