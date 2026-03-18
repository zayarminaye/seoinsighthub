import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/audits/[id]/issues/route';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditRun: {
      findFirst: vi.fn(),
    },
    auditIssue: {
      findMany: vi.fn(),
    },
  },
}));

describe('GET /api/audits/[id]/issues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    vi.mocked(prisma.auditRun.findFirst).mockResolvedValue({ id: 'a1' } as never);
    vi.mocked(prisma.auditIssue.findMany).mockResolvedValue([
      { id: 'i1', stepNumber: 5 },
    ] as never);
  });

  it('returns empty when stepNumber conflicts with pillar range', async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['pillar', 'usability'],
          ['stepNumber', '12'],
        ]),
      },
    } as never;

    const res = await GET(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { data: unknown[]; nextCursor?: string };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeUndefined();
    expect(prisma.auditIssue.findMany).not.toHaveBeenCalled();
  });

  it('uses explicit stepNumber when it is within selected pillar', async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['pillar', 'usability'],
          ['stepNumber', '5'],
        ]),
      },
    } as never;

    const res = await GET(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { data: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(body.data[0]?.id).toBe('i1');
    expect(prisma.auditIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          auditRunId: 'a1',
          stepNumber: 5,
        }),
      })
    );
  });

  it('returns 400 for invalid query params', async () => {
    const req = {
      nextUrl: {
        searchParams: new URLSearchParams([
          ['severity', 'BLOCKER'],
        ]),
      },
    } as never;

    const res = await GET(req, { params: Promise.resolve({ id: 'a1' }) });
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid query parameters');
  });
});
