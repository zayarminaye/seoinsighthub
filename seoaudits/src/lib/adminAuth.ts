import { currentUser } from '@clerk/nextjs/server';
import { getE2ESessionFromCookies } from './e2eAuth';

export async function isAdminUser(): Promise<boolean> {
  const e2eSession = await getE2ESessionFromCookies();
  if (e2eSession) return e2eSession.role === 'admin';

  const user = await currentUser();
  if (!user) return false;
  const role = (user.publicMetadata as { role?: string } | undefined)?.role;
  return role === 'admin';
}

export async function requireAdmin() {
  if (!(await isAdminUser())) {
    throw new Error('FORBIDDEN_ADMIN');
  }
}
