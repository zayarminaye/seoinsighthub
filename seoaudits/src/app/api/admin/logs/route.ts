import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

function isMissingTableError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2021'
  );
}

// GET /api/admin/logs - admin audit logs
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const limit = Math.min(
      200,
      Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? '50'))
    );
    const action = (req.nextUrl.searchParams.get('action') ?? '').trim();
    const adminId = (req.nextUrl.searchParams.get('adminId') ?? '').trim();
    const cursor = (req.nextUrl.searchParams.get('cursor') ?? '').trim();
    const pageRaw = req.nextUrl.searchParams.get('page');
    const hasPage = pageRaw !== null;
    const page = Math.max(1, Number(pageRaw ?? '1') || 1);

    let logs: unknown[] = [];
    let nextCursor: string | undefined;
    let totalCount = 0;
    let tableMissing = false;
    try {
      const where = {
        ...(action ? { action } : {}),
        ...(adminId ? { adminId } : {}),
      };

      totalCount = await prisma.adminAuditLog.count({ where });

      if (hasPage && !cursor) {
        logs = await prisma.adminAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        });
      } else {
        const rows = await prisma.adminAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const hasMore = rows.length > limit;
        logs = hasMore ? rows.slice(0, -1) : rows;
        nextCursor = hasMore ? (logs[logs.length - 1] as { id: string } | undefined)?.id : undefined;
      }
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      tableMissing = true;
      console.warn('[admin/logs] AdminAuditLog table missing; returning empty logs.');
    }

    return NextResponse.json({ data: logs, nextCursor, totalCount, tableMissing });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
