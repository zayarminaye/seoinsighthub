import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// GET /api/audits/:id — Audit details + scores
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      include: {
        _count: {
          select: {
            pages: true,
            issues: true,
          },
        },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    return NextResponse.json(audit);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
