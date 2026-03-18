import { NextRequest, NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';
import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAuditLog';
import { getActingUserId } from '@/lib/actingUser';
import { QUEUE_NAMES } from '@/services/queue/config';

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
const ALLOWED_QUEUES = new Set(Object.values(QUEUE_NAMES) as QueueName[]);
function isQueueName(value: string): value is QueueName {
  return ALLOWED_QUEUES.has(value as QueueName);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  let queue: Queue | null = null;
  try {
    await requireAdmin();
    const { jobId } = await params;
    const body = (await req.json().catch(() => ({}))) as { queue?: string };
    const queueName = body.queue;

    if (!queueName || !isQueueName(queueName)) {
      return NextResponse.json({ error: 'Invalid queue' }, { status: 400 });
    }

    queue = new Queue(queueName, { connection: redis });
    const job = await queue.getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    await job.retry();

    const adminId = await getActingUserId();
    if (adminId) {
      try {
        await logAdminAction({
          adminId,
          action: 'job.retried',
          targetId: jobId,
          details: { queue: queueName },
        });
      } catch (logErr) {
        console.warn('Failed to write admin audit log for retried job:', logErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    if (queue) {
      await queue.close();
    }
  }
}
