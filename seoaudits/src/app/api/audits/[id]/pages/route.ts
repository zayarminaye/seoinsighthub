import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { ListPagesSchema } from '@/lib/validators/audit';

// GET /api/audits/:id/pages — List audited pages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    // Verify ownership
    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const input = ListPagesSchema.parse(searchParams);

    const orderBy = input.sortBy
      ? { [input.sortBy]: input.sortOrder }
      : { createdAt: 'asc' as const };

    const pages = await prisma.auditPage.findMany({
      where: {
        auditRunId: id,
        ...(input.decayBucket && { decayBucket: input.decayBucket }),
        ...(input.stepNumber && {
          issues: {
            some: { stepNumber: input.stepNumber },
          },
        }),
      },
      orderBy,
      take: input.limit + 1,
      ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
    });

    const hasMore = pages.length > input.limit;
    const data = hasMore ? pages.slice(0, -1) : pages;
    const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

    return NextResponse.json({ data, nextCursor });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid query parameters.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
