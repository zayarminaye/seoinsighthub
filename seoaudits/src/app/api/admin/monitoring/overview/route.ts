import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { requireAdmin } from '@/lib/adminAuth';
import { QUEUE_NAMES } from '@/services/queue/config';

export async function GET() {
  try {
    await requireAdmin();

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [activeCount, failed24h, completed24h, usersCount] = await Promise.all([
      prisma.auditRun.count({
        where: { status: { in: ['QUEUED', 'CRAWLING', 'RUNNING'] } },
      }),
      prisma.auditRun.count({
        where: { status: 'FAILED', createdAt: { gte: since24h } },
      }),
      prisma.auditRun.count({
        where: { status: 'COMPLETED', completedAt: { gte: since24h } },
      }),
      prisma.user.count(),
    ]);

    const queueNames = Object.values(QUEUE_NAMES);
    const queueCounts = await Promise.all(
      queueNames.map(async (name) => {
        const q = new Queue(name, { connection: redis });
        const counts = await q.getJobCounts('active', 'waiting', 'failed');
        await q.close();
        return { name, counts };
      })
    );

    return NextResponse.json({
      data: {
        activeAudits: activeCount,
        failedAudits24h: failed24h,
        completedAudits24h: completed24h,
        usersCount,
        queues: queueCounts,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
