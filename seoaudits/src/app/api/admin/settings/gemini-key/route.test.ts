import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from '@/app/api/admin/settings/gemini-key/route';
import { requireAdmin } from '@/lib/adminAuth';
import { getActingUserId } from '@/lib/actingUser';
import { logAdminAction } from '@/lib/adminAuditLog';
import { getAdminGeminiKeyStatus, setAdminGeminiApiKey } from '@/lib/geminiApiKeys';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/actingUser', () => ({
  getActingUserId: vi.fn(),
}));

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminAction: vi.fn(),
}));

vi.mock('@/lib/geminiApiKeys', () => ({
  getAdminGeminiKeyStatus: vi.fn(),
  setAdminGeminiApiKey: vi.fn(),
}));

describe('GET/PATCH /api/admin/settings/gemini-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
  });

  it('returns status for admin key', async () => {
    vi.mocked(getAdminGeminiKeyStatus).mockResolvedValue({ configured: true });
    const res = await GET();
    const body = (await res.json()) as { data?: { configured: boolean } };
    expect(res.status).toBe(200);
    expect(body.data?.configured).toBe(true);
  });

  it('returns 403 when non-admin calls GET', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('updates admin fallback key and logs action', async () => {
    vi.mocked(getActingUserId).mockResolvedValue('admin_1');
    vi.mocked(setAdminGeminiApiKey).mockResolvedValue(undefined);
    vi.mocked(logAdminAction).mockResolvedValue(undefined);

    const req = {
      json: vi.fn().mockResolvedValue({ apiKey: 'test-key' }),
    } as never;
    const res = await PATCH(req);
    const body = (await res.json()) as { data?: { configured: boolean } };

    expect(res.status).toBe(200);
    expect(body.data?.configured).toBe(true);
    expect(setAdminGeminiApiKey).toHaveBeenCalledWith('admin_1', 'test-key');
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });
});
