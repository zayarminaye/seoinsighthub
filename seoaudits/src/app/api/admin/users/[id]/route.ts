import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { UpdateUserAdminSchema } from '@/lib/validators/admin';
import { logAdminAction } from '@/lib/adminAuditLog';
import { updateManagedUser } from '@/lib/adminUsers';
import { prisma } from '@/lib/prisma';
import { getActingUserId } from '@/lib/actingUser';

// GET /api/admin/users/:id - user details and stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            auditRuns: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ data: user });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/users/:id - update user plan/auditLimit/disabled
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();

    const input = UpdateUserAdminSchema.parse({
      userId: id,
      plan: body.plan,
      auditLimit: body.auditLimit,
      disabled: body.disabled,
      role: body.role,
    });

    const adminId = await getActingUserId();
    if (adminId) {
      const result = await updateManagedUser({
        userId: id,
        adminId,
        plan: input.plan,
        auditLimit: input.auditLimit,
        disabled: input.disabled,
        role: input.role,
      });

      const actions: Array<{
        action: string;
        details: Record<string, unknown>;
      }> = [];

      if (result.changed.plan) {
        actions.push({
          action: 'user.plan.changed',
          details: { before: result.before.plan, after: result.after.plan },
        });
      }
      if (result.changed.auditLimit) {
        actions.push({
          action: 'user.auditLimit.changed',
          details: { before: result.before.auditLimit, after: result.after.auditLimit },
        });
      }
      if (result.changed.disabled) {
        actions.push({
          action: 'user.disabled',
          details: { before: result.before.disabled, after: result.after.disabled },
        });
      }
      if (result.changed.role) {
        actions.push({
          action:
            result.after.role === 'admin'
              ? 'admin.role.granted'
              : 'admin.role.revoked',
          details: { before: result.before.role, after: result.after.role },
        });
      }

      if (actions.length === 0) {
        actions.push({
          action: 'user.updated',
          details: { before: result.before, after: result.after },
        });
      }

      await Promise.all(
        actions.map((entry) =>
          logAdminAction({
            adminId,
            action: entry.action,
            targetId: id,
            details: entry.details,
          })
        )
      );

      return NextResponse.json({ data: result.user });
    }

    const result = await updateManagedUser({
      userId: id,
      adminId: 'system',
      plan: input.plan,
      auditLimit: input.auditLimit,
      disabled: input.disabled,
      role: input.role,
    });

    return NextResponse.json({ data: result.user });
  } catch (err) {
    if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (err instanceof Error && err.message === 'CANNOT_REVOKE_SELF_ADMIN') {
      return NextResponse.json(
        { error: 'You cannot revoke your own admin role.' },
        { status: 400 }
      );
    }
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
