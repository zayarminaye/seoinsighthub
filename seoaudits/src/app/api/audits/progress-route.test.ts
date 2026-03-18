import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/audits/[id]/progress/route';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('GET /api/audits/[id]/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth response when requireUser throws Response', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const res = await GET({} as never, { params: Promise.resolve({ id: 'a1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when audit is not found for user', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue(null);

    const res = await GET({} as never, { params: Promise.resolve({ id: 'a404' }) });
    const text = await res.text();

    expect(res.status).toBe(404);
    expect(text).toContain('Audit not found');
  });

  it('returns SSE response and emits progress payload', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({
      id: 'a1',
      status: 'COMPLETED',
    } as never);
    vi.mocked(prisma.auditRun.findUnique).mockResolvedValue({
      status: 'COMPLETED',
      currentStep: 7,
      currentStepName: 'Accessibility',
      totalPages: 10,
      completedPages: 10,
    } as never);

    const res = await GET({} as never, { params: Promise.resolve({ id: 'a1' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const reader = res.body?.getReader();
    expect(reader).toBeTruthy();
    const first = await reader!.read();
    const chunk = new TextDecoder().decode(first.value ?? new Uint8Array());

    expect(chunk).toContain('data:');
    expect(chunk).toContain('"auditId":"a1"');
    expect(chunk).toContain('"status":"COMPLETED"');
  });
});
