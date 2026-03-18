import { headers } from 'next/headers';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from './prisma';

function isMissingTableError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2021'
  );
}

export async function logAdminAction(input: {
  adminId: string;
  action: string;
  targetId?: string;
  details: Record<string, unknown>;
}) {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0]?.trim() || null;

  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        targetId: input.targetId,
        details: input.details as unknown as Prisma.InputJsonValue,
        ipAddress,
      },
    });
  } catch (err) {
    // Allow app usage before migrations are applied in dev.
    if (isMissingTableError(err)) {
      console.warn('[adminAuditLog] Table missing; skipping admin log write.');
      return;
    }
    throw err;
  }
}
