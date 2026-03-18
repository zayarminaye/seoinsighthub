import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isAdminUser, requireAdmin } from './adminAuth';
import { currentUser } from '@clerk/nextjs/server';

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
}));

describe('adminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when no signed-in user', async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    await expect(isAdminUser()).resolves.toBe(false);
  });

  it('returns true for admin role', async () => {
    vi.mocked(currentUser).mockResolvedValue({
      publicMetadata: { role: 'admin' },
    } as never);
    await expect(isAdminUser()).resolves.toBe(true);
  });

  it('throws FORBIDDEN_ADMIN for non-admin users', async () => {
    vi.mocked(currentUser).mockResolvedValue({
      publicMetadata: { role: 'free' },
    } as never);
    await expect(requireAdmin()).rejects.toThrow('FORBIDDEN_ADMIN');
  });
});
