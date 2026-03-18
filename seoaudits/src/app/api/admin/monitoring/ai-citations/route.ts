import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 100);
}

export async function GET() {
  try {
    await requireAdmin();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const step16Audits = await prisma.auditRun.findMany({
      where: {
        createdAt: { gte: since24h },
        selectedSteps: { has: 16 },
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    const auditIds = step16Audits.map((a) => a.id);
    if (auditIds.length === 0) {
      return NextResponse.json({
        data: {
          auditsWithStep16: 0,
          attemptedQueries: 0,
          successfulQueries: 0,
          successRate: 0,
          quotaHitAudits: 0,
          quotaHitRate: 0,
          avgRuntimeSeconds: 0,
        },
      });
    }

    const [queries, quotaIssues] = await Promise.all([
      prisma.citationQuery.findMany({
        where: { auditRunId: { in: auditIds } },
        select: {
          auditRunId: true,
          results: {
            select: {
              createdAt: true,
            },
          },
        },
      }),
      prisma.auditIssue.findMany({
        where: {
          auditRunId: { in: auditIds },
          stepNumber: 16,
          category: 'AI Model Quota Exceeded',
        },
        select: { auditRunId: true },
      }),
    ]);

    let attemptedQueries = 0;
    let successfulQueries = 0;

    const runtimeByAudit = new Map<string, { min: number; max: number }>();
    for (const query of queries) {
      attemptedQueries += 1;
      successfulQueries += query.results.length;
      for (const result of query.results) {
        const ts = result.createdAt.getTime();
        const current = runtimeByAudit.get(query.auditRunId);
        if (!current) {
          runtimeByAudit.set(query.auditRunId, { min: ts, max: ts });
        } else {
          current.min = Math.min(current.min, ts);
          current.max = Math.max(current.max, ts);
        }
      }
    }

    const runtimes = [...runtimeByAudit.values()]
      .map((r) => Math.max(0, Math.round((r.max - r.min) / 1000)))
      .filter((v) => v > 0);
    const avgRuntimeSeconds =
      runtimes.length > 0
        ? Math.round(runtimes.reduce((sum, n) => sum + n, 0) / runtimes.length)
        : 0;

    const quotaHitAudits = new Set(quotaIssues.map((i) => i.auditRunId)).size;

    return NextResponse.json({
      data: {
        auditsWithStep16: step16Audits.length,
        attemptedQueries,
        successfulQueries,
        successRate: pct(successfulQueries, attemptedQueries),
        quotaHitAudits,
        quotaHitRate: pct(quotaHitAudits, step16Audits.length),
        avgRuntimeSeconds,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
