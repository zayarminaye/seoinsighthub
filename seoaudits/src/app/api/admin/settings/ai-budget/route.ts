import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getActingUserId } from '@/lib/actingUser';
import { logAdminAction } from '@/lib/adminAuditLog';
import {
  getGeminiMaxQueriesPerAudit,
  setGeminiMaxQueriesPerAudit,
} from '@/lib/adminSettings';
import { UpdateAiBudgetSchema } from '@/lib/validators/admin';

// GET /api/admin/settings/ai-budget
export async function GET() {
  try {
    await requireAdmin();
    const maxQueries = await getGeminiMaxQueriesPerAudit();
    return NextResponse.json({ data: { maxQueries } });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/settings/ai-budget
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const adminId = await getActingUserId();
    if (!adminId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const input = UpdateAiBudgetSchema.parse(body);
    const maxQueries = await setGeminiMaxQueriesPerAudit(adminId, input.maxQueries);

    await logAdminAction({
      adminId,
      action: 'settings.ai-budget.updated',
      details: { maxQueries },
    });

    return NextResponse.json({ data: { maxQueries } });
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
