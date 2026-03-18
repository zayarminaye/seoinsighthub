import { currentUser } from '@clerk/nextjs/server';
import { getE2ESessionFromCookies } from './e2eAuth';

export async function getActingUserId(): Promise<string | null> {
  const e2eSession = await getE2ESessionFromCookies();
  if (e2eSession) return e2eSession.clerkId;

  const user = await currentUser();
  return user?.id ?? null;
}
