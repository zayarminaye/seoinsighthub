import { describe, expect, it } from 'vitest';
import { getPlanTier, PLAN_TIERS } from './planTiers';

describe('plan tiers', () => {
  it('returns configured tier for known plan', () => {
    expect(getPlanTier('free')).toEqual(PLAN_TIERS.free);
    expect(getPlanTier('starter')).toEqual(PLAN_TIERS.starter);
  });

  it('falls back to free for unknown plan', () => {
    expect(getPlanTier('unknown-plan')).toEqual(PLAN_TIERS.free);
  });

  it('has non-zero monthly quota for all configured plans', () => {
    for (const tier of Object.values(PLAN_TIERS)) {
      expect(tier.auditsPerMonth).toBeGreaterThan(0);
    }
  });
});
