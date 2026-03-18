import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserGeminiKeyStatus, setUserGeminiApiKey } from '@/lib/geminiApiKeys';
import { UpdateGeminiApiKeySchema } from '@/lib/validators/admin';

// GET /api/settings/gemini-key - return status only
export async function GET() {
  try {
    const user = await requireUser();
    const status = await getUserGeminiKeyStatus(user.id);
    return NextResponse.json({ data: status });
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/settings/gemini-key - set or clear user's own key
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const input = UpdateGeminiApiKeySchema.parse(body);

    await setUserGeminiApiKey(user.id, input.apiKey);
    return NextResponse.json({
      data: { configured: Boolean(input.apiKey && input.apiKey.trim()) },
    });
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: err.status });
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
