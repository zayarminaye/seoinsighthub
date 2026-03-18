import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/features/route';
import { requireAdmin } from '@/lib/adminAuth';
import { getFeatureFlags } from '@/lib/featureFlags';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({
  getFeatureFlags: vi.fn(),
}));

describe('GET /api/admin/features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when admin check fails', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN_ADMIN'));

    const res = await GET();
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns all feature flags', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(getFeatureFlags).mockResolvedValue({
      'export.pdf': { enabled: true, plans: ['pro'], description: 'PDF export' },
      'export.csv': { enabled: true, plans: ['free', 'pro'], description: 'CSV export' },
    } as never);

    const res = await GET();
    const body = (await res.json()) as {
      data: Record<string, { enabled: boolean }>;
    };

    expect(res.status).toBe(200);
    expect(body.data['export.pdf']?.enabled).toBe(true);
    expect(body.data['export.csv']?.enabled).toBe(true);
  });
});
