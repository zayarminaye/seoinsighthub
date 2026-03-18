import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getPlanTier } from '@/lib/planTiers';
import { isFeatureEnabled } from '@/lib/featureFlags';

type AppPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export async function GET() {
  try {
    const user = await requireUser();
    const tier = getPlanTier(user.plan);
    const plan = user.plan as AppPlan;

    const [uEnabled, rEnabled, aEnabled, citationEnabled] = await Promise.all([
      isFeatureEnabled('audit.steps.usability', plan),
      isFeatureEnabled('audit.steps.relevance', plan),
      isFeatureEnabled('audit.steps.authority', plan),
      isFeatureEnabled('audit.citation-analysis', plan),
    ]);

    const allowedSteps = tier.availableSteps.filter((step) => {
      if (step === 16) return aEnabled && citationEnabled;
      if (step >= 1 && step <= 7) return uEnabled;
      if (step >= 8 && step <= 14) return rEnabled;
      if (step >= 15 && step <= 18) return aEnabled;
      return false;
    });

    return NextResponse.json({
      data: {
        allowedSteps,
        flags: {
          usability: uEnabled,
          relevance: rEnabled,
          authority: aEnabled,
          citationAnalysis: citationEnabled,
        },
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
