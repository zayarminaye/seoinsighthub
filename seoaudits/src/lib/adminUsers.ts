import { clerkClient } from '@clerk/nextjs/server';
import { prisma } from './prisma';

type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface UpdateManagedUserInput {
  userId: string;
  adminId: string;
  plan?: PlanTier;
  auditLimit?: number;
  disabled?: boolean;
  role?: 'user' | 'admin';
}

export async function updateManagedUser(input: UpdateManagedUserInput) {
  const before = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, clerkId: true, plan: true, auditLimit: true },
  });

  if (!before) {
    throw new Error('USER_NOT_FOUND');
  }

  const nextPlan = input.plan ?? before.plan;
  const nextAuditLimit = input.auditLimit ?? before.auditLimit;

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: {
      plan: nextPlan,
      auditLimit: nextAuditLimit,
    },
  });

  let disabledBefore: boolean | null = null;
  let disabledAfter: boolean | null = null;
  let roleBefore: 'user' | 'admin' = 'user';
  let roleAfter: 'user' | 'admin' = 'user';

  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(before.clerkId);
    const publicMetadata = (clerkUser.publicMetadata ?? {}) as Record<string, unknown>;

    disabledBefore =
      typeof publicMetadata.disabled === 'boolean' ? publicMetadata.disabled : false;
    roleBefore = publicMetadata.role === 'admin' ? 'admin' : 'user';

    if (
      input.role === 'user' &&
      roleBefore === 'admin' &&
      input.adminId === before.clerkId
    ) {
      throw new Error('CANNOT_REVOKE_SELF_ADMIN');
    }

    const nextMetadata: Record<string, unknown> = {
      ...publicMetadata,
      plan: nextPlan,
      ...(typeof input.disabled === 'boolean' ? { disabled: input.disabled } : {}),
      ...(typeof input.role === 'string' ? { role: input.role } : {}),
    };

    const needsMetadataUpdate =
      publicMetadata.plan !== nextPlan ||
      (typeof input.disabled === 'boolean' && disabledBefore !== input.disabled) ||
      (typeof input.role === 'string' && roleBefore !== input.role);

    if (needsMetadataUpdate) {
      await clerk.users.updateUser(before.clerkId, {
        publicMetadata: nextMetadata,
      });
    }

    disabledAfter =
      typeof input.disabled === 'boolean' ? input.disabled : disabledBefore;
    roleAfter = typeof input.role === 'string' ? input.role : roleBefore;
  } catch {
    // If Clerk metadata sync fails, Prisma changes still persist.
    disabledAfter = typeof input.disabled === 'boolean' ? input.disabled : disabledBefore;
    roleAfter = typeof input.role === 'string' ? input.role : roleBefore;
    if (input.role === 'user' && input.adminId === before.clerkId && roleBefore === 'admin') {
      throw new Error('CANNOT_REVOKE_SELF_ADMIN');
    }
  }

  return {
    before: {
      plan: before.plan,
      auditLimit: before.auditLimit,
      disabled: disabledBefore,
      role: roleBefore,
    },
    after: {
      plan: updated.plan,
      auditLimit: updated.auditLimit,
      disabled: disabledAfter,
      role: roleAfter,
    },
    changed: {
      plan: before.plan !== updated.plan,
      auditLimit: before.auditLimit !== updated.auditLimit,
      disabled:
        typeof input.disabled === 'boolean' && disabledBefore !== input.disabled,
      role: typeof input.role === 'string' && roleBefore !== input.role,
    },
    user: updated,
  };
}
