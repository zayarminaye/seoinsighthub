import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getFeatureFlags } from '@/lib/featureFlags';

// GET /api/admin/features - list feature flags
export async function GET() {
  try {
    await requireAdmin();
    const flags = await getFeatureFlags();
    return NextResponse.json({ data: flags });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
