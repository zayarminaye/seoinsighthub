import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  QUEUED: 'outline',
  CRAWLING: 'secondary',
  RUNNING: 'secondary',
  COMPLETED: 'default',
  FAILED: 'destructive',
};

function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  if (score === null) return null;
  const color =
    score >= 80
      ? 'text-green-600 bg-green-50'
      : score >= 50
        ? 'text-yellow-600 bg-yellow-50'
        : 'text-red-600 bg-red-50';
  return (
    <div className={`rounded-md px-3 py-2 text-center ${color}`}>
      <div className="text-2xl font-bold">{score}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();

  const audits = await prisma.auditRun.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      targetDomain: true,
      status: true,
      totalPages: true,
      uraScoreU: true,
      uraScoreR: true,
      uraScoreA: true,
      uraScoreOverall: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your SEO audits at a glance
          </p>
        </div>
      </div>

      {audits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="mb-4 text-lg text-muted-foreground">
              No audits yet. Start your first SEO audit.
            </p>
            <Link
              href="/audits/new"
              className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create Audit
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {audits.map((audit) => (
            <Link key={audit.id} href={`/audits/${audit.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium truncate">
                      {audit.targetDomain}
                    </CardTitle>
                    <Badge variant={STATUS_VARIANT[audit.status] ?? 'outline'}>
                      {audit.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {audit.createdAt.toLocaleDateString()} &middot;{' '}
                    {audit.totalPages} pages
                  </p>
                </CardHeader>
                <CardContent>
                  {audit.uraScoreOverall !== null ? (
                    <div className="flex gap-2">
                      <ScoreBadge score={audit.uraScoreOverall} label="Overall" />
                      <ScoreBadge score={audit.uraScoreU} label="Usability" />
                      <ScoreBadge score={audit.uraScoreR} label="Relevance" />
                      <ScoreBadge score={audit.uraScoreA} label="Authority" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {audit.status === 'FAILED'
                        ? 'Audit failed'
                        : 'In progress...'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
