import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { isE2EBypassEnabled } from '@/lib/e2eAuth';
import type { Prisma } from '@/generated/prisma/client';

const BootstrapSchema = z.object({
  targetDomain: z.string().url().default('https://example.com'),
});

export async function POST(req: NextRequest) {
  if (!isE2EBypassEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const user = await requireUser();
    const input = BootstrapSchema.parse(await req.json().catch(() => ({})));

    const now = new Date();
    const completedAt = new Date(now.getTime() + 15_000);
    const selectedSteps = Array.from({ length: 18 }, (_, idx) => idx + 1);

    const audit = await prisma.auditRun.create({
      data: {
        userId: user.id,
        targetDomain: input.targetDomain,
        status: 'COMPLETED',
        selectedSteps,
        maxPages: 25,
        totalPages: 2,
        completedPages: 2,
        startedAt: now,
        completedAt,
        uraScoreU: 71,
        uraScoreR: 68,
        uraScoreA: 62,
        uraScoreOverall: 67,
      },
    });

    await prisma.auditPage.createMany({
      data: [
        {
          auditRunId: audit.id,
          url: `${input.targetDomain.replace(/\/$/, '')}/`,
          httpStatus: 200,
          crawlDepth: 0,
          performanceScore: 72,
          inpValue: 180,
          inpRating: 'GOOD',
          mobileFriendly: true,
          accessibilityScore: 84,
          domNodeCount: 1280,
          titleTag: 'Home | E2E Fixture',
          titleLength: 18,
          metaDescription: 'Fixture page for deterministic end-to-end tests.',
          metaDescriptionLength: 47,
          h1Count: 1,
          wordCount: 460,
          internalLinksInbound: 2,
          internalLinksOutbound: 3,
          details: {
            psi: {
              lcpMs: 1800,
              clsValue: 0.06,
              tbtMs: 110,
              fcpMs: 900,
              siMs: 1450,
            },
          } as Prisma.InputJsonValue,
        },
        {
          auditRunId: audit.id,
          url: `${input.targetDomain.replace(/\/$/, '')}/pricing`,
          httpStatus: 200,
          crawlDepth: 1,
          performanceScore: 56,
          inpValue: 260,
          inpRating: 'NEEDS_IMPROVEMENT',
          mobileFriendly: true,
          accessibilityScore: 76,
          domNodeCount: 1680,
          titleTag: 'Pricing | E2E Fixture',
          titleLength: 21,
          metaDescription: 'Pricing fixture page for deterministic exports.',
          metaDescriptionLength: 45,
          h1Count: 1,
          wordCount: 390,
          internalLinksInbound: 1,
          internalLinksOutbound: 2,
          details: {
            psi: {
              lcpMs: 2600,
              clsValue: 0.11,
              tbtMs: 220,
              fcpMs: 1300,
              siMs: 2400,
            },
          } as Prisma.InputJsonValue,
        },
      ],
    });

    await prisma.auditIssue.createMany({
      data: [
        {
          auditRunId: audit.id,
          stepNumber: 3,
          severity: 'MODERATE',
          category: 'Core Web Vitals',
          message: 'Largest Contentful Paint is above the recommended threshold on /pricing.',
          recommendation: 'Optimize hero image size and defer non-critical scripts.',
        },
        {
          auditRunId: audit.id,
          stepNumber: 1,
          severity: 'MINOR',
          category: 'DOM Size',
          message: 'DOM size is slightly high on /pricing.',
          recommendation: 'Reduce nested containers and virtualize long sections.',
        },
      ],
    });

    return NextResponse.json({ data: { auditId: audit.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
