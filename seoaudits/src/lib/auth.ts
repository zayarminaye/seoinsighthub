import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from './prisma';
import { logSecurityEvent } from './securityLogger';
import { getPlanTier } from './planTiers';
import { getE2ESessionFromCookies } from './e2eAuth';

export async function getCurrentUser() {
  const e2eSession = await getE2ESessionFromCookies();
  if (e2eSession) {
    const planTier = getPlanTier(e2eSession.plan);
    const user = await prisma.user.upsert({
      where: { clerkId: e2eSession.clerkId },
      update: {
        email: e2eSession.email,
        name: e2eSession.name ?? null,
        plan: e2eSession.plan,
      },
      create: {
        clerkId: e2eSession.clerkId,
        email: e2eSession.email,
        name: e2eSession.name ?? null,
        plan: e2eSession.plan,
        auditLimit: planTier.auditsPerMonth,
      },
    });
    return user;
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  let user = await prisma.user.findUnique({
    where: { clerkId },
  });

  // Auto-create user if authenticated in Clerk but missing from DB
  // (handles case where webhook hasn't fired yet)
  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;
    const metadata = (clerkUser.publicMetadata ?? {}) as { plan?: string };
    const plan = typeof metadata.plan === 'string' ? metadata.plan : 'free';
    const planTier = getPlanTier(plan);

    user = await prisma.user.upsert({
      where: { clerkId },
      update: {},
      create: {
        clerkId,
        email: clerkUser.emailAddresses[0]?.emailAddress ?? '',
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null,
        plan,
        auditLimit: planTier.auditsPerMonth,
      },
    });
  }

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    logSecurityEvent({ type: 'AUTH_FAILURE', details: 'No authenticated user found' });
    throw new Response('Unauthorized', { status: 401 });
  }

  const e2eSession = await getE2ESessionFromCookies();
  if (e2eSession) {
    if (e2eSession.disabled) {
      logSecurityEvent({
        type: 'AUTH_FAILURE',
        userId: user.id,
        details: 'Disabled account attempted authenticated access (e2e bypass)',
      });
      throw new Response('Forbidden', { status: 403 });
    }
    return user;
  }

  const clerkUser = await currentUser();
  const metadata = (clerkUser?.publicMetadata ?? {}) as { disabled?: boolean };
  if (metadata.disabled === true) {
    logSecurityEvent({
      type: 'AUTH_FAILURE',
      userId: user.id,
      details: 'Disabled account attempted authenticated access',
    });
    throw new Response('Forbidden', { status: 403 });
  }

  return user;
}
