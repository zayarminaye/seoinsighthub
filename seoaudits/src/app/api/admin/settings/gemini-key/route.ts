import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getActingUserId } from '@/lib/actingUser';
import { logAdminAction } from '@/lib/adminAuditLog';
import {
  getAdminGeminiKeyStatus,
  setAdminGeminiApiKey,
} from '@/lib/geminiApiKeys';
import { UpdateGeminiApiKeySchema } from '@/lib/validators/admin';

// GET /api/admin/settings/gemini-key - return status only
export async function GET() {
  try {
    await requireAdmin();
    const status = await getAdminGeminiKeyStatus();
    return NextResponse.json({ data: status });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/settings/gemini-key - set or clear admin fallback key
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const adminId = await getActingUserId();
    if (!adminId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const input = UpdateGeminiApiKeySchema.parse(body);
    await setAdminGeminiApiKey(adminId, input.apiKey);

    await logAdminAction({
      adminId,
      action: 'settings.gemini-key.updated',
      details: { configured: Boolean(input.apiKey && input.apiKey.trim()) },
    });

    return NextResponse.json({
      data: { configured: Boolean(input.apiKey && input.apiKey.trim()) },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    if (err instanceof Error && err.message.includes('APP_ENCRYPTION_KEY')) {
      return NextResponse.json(
        { error: 'APP_ENCRYPTION_KEY is not configured on the server.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
