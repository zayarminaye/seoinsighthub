import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

// GET /api/admin/users/:id/audits - audits for a specific user
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const audits = await prisma.auditRun.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        targetDomain: true,
        status: true,
        totalPages: true,
        createdAt: true,
        completedAt: true,
        uraScoreOverall: true,
      },
    });

    return NextResponse.json({ data: audits });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

