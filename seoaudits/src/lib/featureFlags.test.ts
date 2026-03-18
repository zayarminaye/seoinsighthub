import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetFeatureFlagsCacheForTests,
  getFeatureFlags,
  isFeatureEnabled,
  setFeatureFlag,
} from '@/lib/featureFlags';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    featureFlags: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('featureFlags cache behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetFeatureFlagsCacheForTests();
  });

  it('caches feature flags for repeated reads', async () => {
    vi.mocked(prisma.featureFlags.findUnique).mockResolvedValue({
      flags: {
        'export.pdf': { enabled: false, plans: ['free'], description: 'PDF export' },
      },
    } as never);

    const first = await getFeatureFlags();
    const second = await getFeatureFlags();

    expect(first['export.pdf']?.enabled).toBe(false);
    expect(second['export.pdf']?.enabled).toBe(false);
    expect(prisma.featureFlags.findUnique).toHaveBeenCalledTimes(1);
  });

  it('updates cache after setFeatureFlag so next checks are fresh', async () => {
    vi.mocked(prisma.featureFlags.findUnique).mockResolvedValue({
      flags: {
        'export.pdf': { enabled: true, plans: ['free', 'starter'], description: 'PDF export' },
      },
    } as never);
    vi.mocked(prisma.featureFlags.upsert).mockResolvedValue({ id: 'global' } as never);

    await setFeatureFlag(
      'export.pdf',
      { enabled: false, plans: ['starter'], description: 'PDF export' },
      'admin_1'
    );

    const enabledForStarter = await isFeatureEnabled('export.pdf', 'starter');
    const enabledForFree = await isFeatureEnabled('export.pdf', 'free');

    expect(enabledForStarter).toBe(false);
    expect(enabledForFree).toBe(false);
    expect(prisma.featureFlags.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.featureFlags.upsert).toHaveBeenCalledTimes(1);
  });
});
