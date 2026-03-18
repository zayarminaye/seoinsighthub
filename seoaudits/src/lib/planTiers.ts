/**
 * Plan tier configuration.
 * Defines limits and features for each subscription plan.
 */

export interface PlanTier {
  name: string;
  label: string;
  /** Monthly audit limit */
  auditsPerMonth: number;
  /** Maximum pages per audit */
  maxPagesPerAudit: number;
  /** Which step numbers are included */
  availableSteps: number[];
  /** Can export to PDF */
  pdfExport: boolean;
  /** Can export to CSV/JSON */
  dataExport: boolean;
}

export const PLAN_TIERS: Record<string, PlanTier> = {
  free: {
    name: 'free',
    label: 'Free',
    auditsPerMonth: 5,
    maxPagesPerAudit: 25,
    availableSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    pdfExport: true,
    dataExport: true,
  },
  starter: {
    name: 'starter',
    label: 'Starter',
    auditsPerMonth: 20,
    maxPagesPerAudit: 100,
    availableSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    pdfExport: true,
    dataExport: true,
  },
  pro: {
    name: 'pro',
    label: 'Pro',
    auditsPerMonth: 100,
    maxPagesPerAudit: 500,
    availableSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    pdfExport: true,
    dataExport: true,
  },
  enterprise: {
    name: 'enterprise',
    label: 'Enterprise',
    auditsPerMonth: 1000,
    maxPagesPerAudit: 1000,
    availableSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    pdfExport: true,
    dataExport: true,
  },
};

/**
 * Get the plan tier for a user's plan string.
 * Falls back to 'free' for unknown plans.
 */
export function getPlanTier(plan: string): PlanTier {
  return PLAN_TIERS[plan] ?? PLAN_TIERS.free!;
}
