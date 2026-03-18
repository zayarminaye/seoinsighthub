import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';
import { requireAdmin } from '@/lib/adminAuth';
import { QUEUE_NAMES } from '@/services/queue/config';

export async function GET() {
  try {
    await requireAdmin();

    const names = Object.values(QUEUE_NAMES);
    const entries = await Promise.all(
      names.map(async (name) => {
        const q = new Queue(name, { connection: redis });
        const counts = await q.getJobCounts(
          'active',
          'waiting',
          'delayed',
          'failed',
          'completed'
        );
        await q.close();
        return [name, counts] as const;
      })
    );

    return NextResponse.json({ data: Object.fromEntries(entries) });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
