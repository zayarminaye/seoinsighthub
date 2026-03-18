import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/audits/:id/progress — SSE stream
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true },
    });
    if (!audit) {
      return new Response('Audit not found', { status: 404 });
    }

    // Poll the database every 2 seconds and stream progress via SSE
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const close = () => {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
          }
        };

        const send = (data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            close();
          }
        };

        const poll = async () => {
          if (closed) return;

          try {
            const current = await prisma.auditRun.findUnique({
              where: { id },
              select: {
                status: true,
                currentStep: true,
                currentStepName: true,
                totalPages: true,
                completedPages: true,
              },
            });

            if (!current) {
              send({ error: 'Audit not found' });
              close();
              return;
            }

            const rawRatio =
              current.totalPages > 0
                ? current.completedPages / current.totalPages
                : 0;
            const percentComplete = Math.round(
              Math.min(1, Math.max(0, rawRatio)) * 100
            );

            send({
              auditId: id,
              status: current.status,
              currentStep: current.currentStep,
              currentStepName: current.currentStepName,
              urlsProcessed: current.completedPages,
              urlsTotal: current.totalPages,
              percentComplete,
              timestamp: new Date().toISOString(),
            });

            if (current.status === 'COMPLETED' || current.status === 'FAILED') {
              close();
              return;
            }

            setTimeout(poll, 2000);
          } catch {
            close();
          }
        };

        poll();
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response('Internal server error', { status: 500 });
  }
}
