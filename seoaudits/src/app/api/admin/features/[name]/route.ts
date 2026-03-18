import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { setFeatureFlag } from '@/lib/featureFlags';
import { UpdateFeatureFlagSchema } from '@/lib/validators/admin';
import { logAdminAction } from '@/lib/adminAuditLog';
import { getActingUserId } from '@/lib/actingUser';

// PATCH /api/admin/features/:name - update a feature flag
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await requireAdmin();
    const { name } = await params;
    const body = await req.json();
    const input = UpdateFeatureFlagSchema.parse(body);

    const adminId = await getActingUserId();
    if (!adminId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updated = await setFeatureFlag(name, input, adminId);

    await logAdminAction({
      adminId,
      action: 'feature.toggled',
      targetId: name,
      details: { patch: input, result: updated },
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
