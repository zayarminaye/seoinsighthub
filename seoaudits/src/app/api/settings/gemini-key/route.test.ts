import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from '@/app/api/settings/gemini-key/route';
import { requireUser } from '@/lib/auth';
import { getUserGeminiKeyStatus, setUserGeminiApiKey } from '@/lib/geminiApiKeys';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/geminiApiKeys', () => ({
  getUserGeminiKeyStatus: vi.fn(),
  setUserGeminiApiKey: vi.fn(),
}));

describe('GET/PUT /api/settings/gemini-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
  });

  it('returns current user key status', async () => {
    vi.mocked(getUserGeminiKeyStatus).mockResolvedValue({ configured: false });
    const res = await GET();
    const body = (await res.json()) as { data?: { configured: boolean } };
    expect(res.status).toBe(200);
    expect(body.data?.configured).toBe(false);
  });

  it('sets user key', async () => {
    vi.mocked(setUserGeminiApiKey).mockResolvedValue(undefined);
    const req = {
      json: vi.fn().mockResolvedValue({ apiKey: 'abc123' }),
    } as never;
    const res = await PUT(req);
    const body = (await res.json()) as { data?: { configured: boolean } };
    expect(res.status).toBe(200);
    expect(body.data?.configured).toBe(true);
    expect(setUserGeminiApiKey).toHaveBeenCalledWith('u1', 'abc123');
  });
});
