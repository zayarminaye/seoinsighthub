import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateManagedUser } from './adminUsers';
import { prisma } from './prisma';
import { clerkClient } from '@clerk/nextjs/server';

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}));

describe('updateManagedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws USER_NOT_FOUND when no user exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      updateManagedUser({ userId: 'missing', adminId: 'admin_1' })
    ).rejects.toThrow('USER_NOT_FOUND');
  });

  it('updates prisma and clerk metadata when values change', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk_u1',
      plan: 'free',
      auditLimit: 5,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'u1',
      clerkId: 'clerk_u1',
      plan: 'starter',
      auditLimit: 20,
    } as never);

    const updateUser = vi.fn().mockResolvedValue({});
    const getUser = vi.fn().mockResolvedValue({
      publicMetadata: { role: 'user', plan: 'free', disabled: false },
    });
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUser, updateUser },
    } as never);

    const result = await updateManagedUser({
      userId: 'u1',
      adminId: 'admin_1',
      plan: 'starter',
      auditLimit: 20,
      disabled: true,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { plan: 'starter', auditLimit: 20 },
    });
    expect(updateUser).toHaveBeenCalledWith('clerk_u1', {
      publicMetadata: { role: 'user', plan: 'starter', disabled: true },
    });
    expect(result.changed).toEqual({
      plan: true,
      auditLimit: true,
      disabled: true,
      role: false,
    });
  });

  it('persists prisma update even if clerk sync fails', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u2',
      clerkId: 'clerk_u2',
      plan: 'free',
      auditLimit: 5,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'u2',
      clerkId: 'clerk_u2',
      plan: 'pro',
      auditLimit: 100,
    } as never);

    vi.mocked(clerkClient).mockRejectedValue(new Error('clerk-down'));

    const result = await updateManagedUser({
      userId: 'u2',
      adminId: 'admin_1',
      plan: 'pro',
      auditLimit: 100,
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(result.after.plan).toBe('pro');
    expect(result.after.auditLimit).toBe(100);
    expect(result.changed.role).toBe(false);
  });

  it('prevents revoking own admin role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      clerkId: 'admin_1',
      plan: 'pro',
      auditLimit: 100,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'u1',
      clerkId: 'admin_1',
      plan: 'pro',
      auditLimit: 100,
    } as never);

    const updateUser = vi.fn().mockResolvedValue({});
    const getUser = vi.fn().mockResolvedValue({
      publicMetadata: { role: 'admin', plan: 'pro', disabled: false },
    });
    vi.mocked(clerkClient).mockResolvedValue({
      users: { getUser, updateUser },
    } as never);

    await expect(
      updateManagedUser({
        userId: 'u1',
        adminId: 'admin_1',
        role: 'user',
      })
    ).rejects.toThrow('CANNOT_REVOKE_SELF_ADMIN');
  });
});
