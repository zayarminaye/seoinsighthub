import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from './prisma';
import { getPlanTier } from './planTiers';
import { getCurrentUser, requireUser } from './auth';
import { logSecurityEvent } from './securityLogger';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('./planTiers', () => ({
  getPlanTier: vi.fn(),
}));

vi.mock('./securityLogger', () => ({
  logSecurityEvent: vi.fn(),
}));

describe('auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPlanTier).mockReturnValue({
      name: 'free',
      label: 'Free',
      auditsPerMonth: 5,
      maxPagesPerAudit: 25,
      availableSteps: [1, 2, 3, 4, 5, 6, 7],
      pdfExport: false,
      dataExport: true,
    });
  });

  it('getCurrentUser returns null when there is no auth user', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('getCurrentUser auto-creates missing db user from Clerk profile', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(currentUser).mockResolvedValue({
      firstName: 'A',
      lastName: 'B',
      emailAddresses: [{ emailAddress: 'ab@example.com' }],
      publicMetadata: { plan: 'starter' },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk_1',
      email: 'ab@example.com',
      name: 'A B',
      plan: 'starter',
      auditLimit: 5,
    } as never);

    const user = await getCurrentUser();

    expect(user?.id).toBe('u1');
    expect(prisma.user.upsert).toHaveBeenCalled();
  });

  it('requireUser throws 401 when no authenticated user exists', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
    expect(logSecurityEvent).toHaveBeenCalled();
  });

  it('requireUser throws 403 when Clerk metadata marks account disabled', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk_1',
      plan: 'free',
      auditLimit: 5,
    } as never);
    vi.mocked(currentUser).mockResolvedValue({
      publicMetadata: { disabled: true },
    } as never);

    await expect(requireUser()).rejects.toMatchObject({ status: 403 });
    expect(logSecurityEvent).toHaveBeenCalled();
  });

  it('requireUser returns user when active', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_1' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk_1',
      plan: 'free',
      auditLimit: 5,
    } as never);
    vi.mocked(currentUser).mockResolvedValue({
      publicMetadata: { disabled: false },
    } as never);

    const user = await requireUser();
    expect(user.id).toBe('u1');
  });
});
