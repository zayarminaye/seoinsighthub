import { describe, expect, it, vi } from 'vitest';
import { POST as SessionPost, DELETE as SessionDelete } from '@/app/api/e2e/session/route';
import { POST as BootstrapPost } from '@/app/api/e2e/bootstrap/route';

vi.mock('@/lib/e2eAuth', () => ({
  isE2EBypassEnabled: vi.fn(() => false),
}));

describe('E2E routes guard', () => {
  it('returns 404 for POST /api/e2e/session when bypass is disabled', async () => {
    const req = new Request('http://localhost/api/e2e/session', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const res = await SessionPost(req as never);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 404 for DELETE /api/e2e/session when bypass is disabled', async () => {
    const res = await SessionDelete();
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 404 for POST /api/e2e/bootstrap when bypass is disabled', async () => {
    const req = new Request('http://localhost/api/e2e/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ targetDomain: 'https://example.com' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await BootstrapPost(req as never);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});
