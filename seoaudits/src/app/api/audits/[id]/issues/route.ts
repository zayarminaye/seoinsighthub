import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { ListIssuesSchema } from '@/lib/validators/audit';

const PILLAR_STEPS: Record<string, [number, number]> = {
  usability: [1, 7],
  relevance: [8, 14],
  authority: [15, 18],
};

// GET /api/audits/:id/issues — List all issues
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const input = ListIssuesSchema.parse(searchParams);

    const stepRange = input.pillar ? PILLAR_STEPS[input.pillar] : undefined;
    if (
      input.stepNumber &&
      stepRange &&
      (input.stepNumber < stepRange[0] || input.stepNumber > stepRange[1])
    ) {
      return NextResponse.json({ data: [], nextCursor: undefined });
    }

    const issues = await prisma.auditIssue.findMany({
      where: {
        auditRunId: id,
        ...(input.severity && { severity: input.severity }),
        ...(!input.stepNumber &&
          stepRange && {
            stepNumber: { gte: stepRange[0], lte: stepRange[1] },
          }),
        ...(input.stepNumber && { stepNumber: input.stepNumber }),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      take: input.limit + 1,
      ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
    });

    const hasMore = issues.length > input.limit;
    const data = hasMore ? issues.slice(0, -1) : issues;
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
