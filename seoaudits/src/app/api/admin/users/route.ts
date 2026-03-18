import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';
import { ListUsersAdminSchema } from '@/lib/validators/admin';

// GET /api/admin/users - list users for admin management
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const input = ListUsersAdminSchema.parse(params);

    const users = await prisma.user.findMany({
      where: {
        ...(input.plan && { plan: input.plan }),
        ...(input.search && {
          OR: [
            { email: { contains: input.search, mode: 'insensitive' } },
            { name: { contains: input.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      include: {
        _count: {
          select: {
            auditRuns: true,
          },
        },
      },
    });

    const hasMore = users.length > input.limit;
    const data = hasMore ? users.slice(0, -1) : users;
    const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

    return NextResponse.json({ data, nextCursor });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
