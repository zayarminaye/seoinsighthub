import { prisma } from './prisma';
import type { Prisma } from '@/generated/prisma/client';

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface FeatureFlagConfig {
  enabled: boolean;
  plans: PlanTier[];
  description: string;
}

const FEATURE_FLAGS_CACHE_TTL_MS = 60_000;

let featureFlagsCache:
  | {
      value: Record<string, FeatureFlagConfig>;
      expiresAt: number;
    }
  | null = null;

export const DEFAULT_FLAGS: Record<string, FeatureFlagConfig> = {
  'audit.steps.usability': {
    enabled: true,
    plans: ['free', 'starter', 'pro', 'enterprise'],
    description: 'Steps 1-7 Usability pillar',
  },
  'audit.steps.relevance': {
    enabled: true,
    plans: ['free', 'starter', 'pro', 'enterprise'],
    description: 'Steps 8-14 Relevance pillar',
  },
  'audit.steps.authority': {
    enabled: true,
    plans: ['free', 'starter', 'pro', 'enterprise'],
    description: 'Steps 15-18 Authority pillar',
  },
  'audit.citation-analysis': {
    enabled: true,
    plans: ['starter', 'pro', 'enterprise'],
    description: 'AI citation gap analysis',
  },
  'export.pdf': {
    enabled: true,
    plans: ['free', 'starter', 'pro', 'enterprise'],
    description: 'PDF report export',
  },
  'export.csv': {
    enabled: true,
    plans: ['free', 'starter', 'pro', 'enterprise'],
    description: 'CSV data export',
  },
  'export.json': {
    enabled: true,
    plans: ['free', 'starter', 'pro', 'enterprise'],
    description: 'JSON data export',
  },
  'audit.max-pages-override': {
    enabled: false,
    plans: ['enterprise'],
    description: 'Allow max pages above plan limit',
  },
};

function setCache(flags: Record<string, FeatureFlagConfig>) {
  featureFlagsCache = {
    value: flags,
    expiresAt: Date.now() + FEATURE_FLAGS_CACHE_TTL_MS,
  };
}

function getCachedValue() {
  if (!featureFlagsCache) return null;
  if (featureFlagsCache.expiresAt < Date.now()) {
    featureFlagsCache = null;
    return null;
  }
  return featureFlagsCache.value;
}

function isMissingTableError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2021'
  );
}

export async function getFeatureFlags(): Promise<Record<string, FeatureFlagConfig>> {
  const cached = getCachedValue();
  if (cached) return cached;

  let row: { flags: unknown } | null = null;
  try {
    row = await prisma.featureFlags.findUnique({
      where: { id: 'global' },
      select: { flags: true },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[featureFlags] Table missing; using default flags.');
      setCache(DEFAULT_FLAGS);
      return DEFAULT_FLAGS;
    }
    throw err;
  }

  if (!row) {
    try {
      await prisma.featureFlags.create({
        data: {
          id: 'global',
          flags: DEFAULT_FLAGS as unknown as Prisma.InputJsonValue,
          updatedBy: 'system',
        },
      });
    } catch (err) {
      if (isMissingTableError(err)) {
        console.warn('[featureFlags] Table missing; using default flags.');
      } else {
        throw err;
      }
    }
    setCache(DEFAULT_FLAGS);
    return DEFAULT_FLAGS;
  }

  const flags = row.flags as Record<string, FeatureFlagConfig> | null;
  const merged = { ...DEFAULT_FLAGS, ...(flags ?? {}) };
  setCache(merged);
  return merged;
}

export async function setFeatureFlag(
  name: string,
  patch: Partial<FeatureFlagConfig>,
  adminId: string
) {
  const current = await getFeatureFlags();
  const next: FeatureFlagConfig = {
    ...(current[name] ?? {
      enabled: false,
      plans: ['free'],
      description: '',
    }),
    ...patch,
  };

  const merged = { ...current, [name]: next };

  try {
    await prisma.featureFlags.upsert({
      where: { id: 'global' },
      update: {
        flags: merged as unknown as Prisma.InputJsonValue,
        updatedBy: adminId,
      },
      create: {
        id: 'global',
        flags: merged as unknown as Prisma.InputJsonValue,
        updatedBy: adminId,
      },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[featureFlags] Table missing; in-memory update only.');
      setCache(merged);
      return next;
    }
    throw err;
  }

  setCache(merged);
  return next;
}

export async function isFeatureEnabled(
  flagName: string,
  userPlan: PlanTier
): Promise<boolean> {
  const flags = await getFeatureFlags();
  const flag = flags[flagName];
  if (!flag || !flag.enabled) return false;
  return flag.plans.includes(userPlan);
}

export function __resetFeatureFlagsCacheForTests() {
  featureFlagsCache = null;
}
