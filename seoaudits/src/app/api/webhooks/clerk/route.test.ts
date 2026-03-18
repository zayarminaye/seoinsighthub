import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/webhooks/clerk/route';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getPlanTier } from '@/lib/planTiers';
import { logSecurityEvent } from '@/lib/securityLogger';

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

const verifyMock = vi.fn();
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function MockWebhook() {
    return { verify: verifyMock };
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/planTiers', () => ({
  getPlanTier: vi.fn(),
}));

vi.mock('@/lib/securityLogger', () => ({
  logSecurityEvent: vi.fn(),
}));

function mockSvixHeaders(values: Record<string, string | null>) {
  vi.mocked(headers).mockResolvedValue({
    get: (name: string) => values[name] ?? null,
  } as never);
}

describe('POST /api/webhooks/clerk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLERK_WEBHOOK_SECRET = 'secret_1';
    vi.mocked(getPlanTier).mockReturnValue({
      name: 'starter',
      label: 'Starter',
      auditsPerMonth: 20,
      maxPagesPerAudit: 100,
      availableSteps: [1, 2, 3, 4, 5, 6, 7],
      pdfExport: true,
      dataExport: true,
    });
  });

  it('returns 500 when webhook secret is missing', async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;

    const res = await POST({ json: vi.fn().mockResolvedValue({}) } as never);
    expect(res.status).toBe(500);
  });

  it('returns 400 when svix headers are missing', async () => {
    mockSvixHeaders({});

    const res = await POST({ json: vi.fn().mockResolvedValue({}) } as never);
    expect(res.status).toBe(400);
    expect(logSecurityEvent).toHaveBeenCalled();
  });

  it('returns 400 for invalid webhook signature', async () => {
    mockSvixHeaders({
      'svix-id': 'id_1',
      'svix-timestamp': 'ts_1',
      'svix-signature': 'sig_1',
    });
    verifyMock.mockImplementation(() => {
      throw new Error('invalid');
    });

    const res = await POST({ json: vi.fn().mockResolvedValue({ test: true }) } as never);
    expect(res.status).toBe(400);
    expect(logSecurityEvent).toHaveBeenCalled();
  });

  it('upserts user on user.created', async () => {
    mockSvixHeaders({
      'svix-id': 'id_1',
      'svix-timestamp': 'ts_1',
      'svix-signature': 'sig_1',
    });
    verifyMock.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'clerk_1',
        first_name: 'A',
        last_name: 'B',
        public_metadata: { plan: 'starter' },
        email_addresses: [{ email_address: 'ab@example.com' }],
      },
    });

    const res = await POST({ json: vi.fn().mockResolvedValue({ some: 'payload' }) } as never);

    expect(res.status).toBe(200);
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { clerkId: 'clerk_1' },
      update: { email: 'ab@example.com', name: 'A B', plan: 'starter' },
      create: {
        clerkId: 'clerk_1',
        email: 'ab@example.com',
        name: 'A B',
        plan: 'starter',
        auditLimit: 20,
      },
    });
  });

  it('deletes user on user.deleted', async () => {
    mockSvixHeaders({
      'svix-id': 'id_1',
      'svix-timestamp': 'ts_1',
      'svix-signature': 'sig_1',
    });
    verifyMock.mockReturnValue({
      type: 'user.deleted',
      data: { id: 'clerk_1' },
    });
    vi.mocked(prisma.user.delete).mockResolvedValue({} as never);

    const res = await POST({ json: vi.fn().mockResolvedValue({}) } as never);

    expect(res.status).toBe(200);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { clerkId: 'clerk_1' } });
  });
});
