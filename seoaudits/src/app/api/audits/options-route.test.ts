import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/audits/options/route';
import { requireUser } from '@/lib/auth';
import { getPlanTier } from '@/lib/planTiers';
import { isFeatureEnabled } from '@/lib/featureFlags';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/planTiers', () => ({
  getPlanTier: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(),
}));

describe('GET /api/audits/options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      id: 'u1',
      plan: 'free',
    } as never);
    vi.mocked(getPlanTier).mockReturnValue({
      availableSteps: [1, 2, 8, 15, 16, 17, 18],
    } as never);
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  });

  it('filters allowed steps by enabled step-group flags', async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (flag: string) => {
      if (flag === 'audit.steps.usability') return true;
      if (flag === 'audit.steps.relevance') return true;
      if (flag === 'audit.steps.authority') return true;
      if (flag === 'audit.citation-analysis') return false;
      return false;
    });

    const res = await GET();
    const body = (await res.json()) as {
      data: { allowedSteps: number[]; flags: { authority: boolean; citationAnalysis: boolean } };
    };

    expect(res.status).toBe(200);
    expect(body.data.allowedSteps).toEqual([1, 2, 8, 15, 17, 18]);
    expect(body.data.flags.authority).toBe(true);
    expect(body.data.flags.citationAnalysis).toBe(false);
  });

  it('returns 401 when user is unauthenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
