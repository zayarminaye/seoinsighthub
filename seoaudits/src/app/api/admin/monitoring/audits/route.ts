import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET() {
  try {
    await requireAdmin();

    const active = await prisma.auditRun.findMany({
      where: { status: { in: ['QUEUED', 'CRAWLING', 'RUNNING'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        targetDomain: true,
        status: true,
        currentStepName: true,
        createdAt: true,
      },
    });

    const failed = await prisma.auditRun.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        targetDomain: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ data: { active, failed } });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
