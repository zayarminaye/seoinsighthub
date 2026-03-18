'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SeverityDonut from './charts/SeverityDonut';
import type { ExecutiveSummary as ExecutiveSummaryData } from '@/services/audit/reportInsights';

const GRADE_BG: Record<string, string> = {
  green: 'bg-green-100 text-green-800 border-green-300',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  red: 'bg-red-100 text-red-800 border-red-300',
};

interface Props {
  data: ExecutiveSummaryData;
}

export default function ExecutiveSummary({ data }: Props) {
  const moderateCount = data.totalIssues - data.criticalCount - data.seriousCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Executive Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Grade + Verdict */}
        <div className="flex items-start gap-6">
          <div
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 text-3xl font-bold ${GRADE_BG[data.gradeColor]}`}
          >
            {data.grade}
          </div>
          <div className="space-y-2">
            <div className="text-2xl font-bold">
              {data.overallScore !== null ? `${data.overallScore}/100` : 'N/A'}
            </div>
            <p className="text-sm text-muted-foreground">{data.verdict}</p>
          </div>
        </div>

        {/* Stats row + Donut */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Pages Audited" value={data.pagesAudited} />
            <StatCard label="Total Issues" value={data.totalIssues} />
            <StatCard label="Critical" value={data.criticalCount} accent="text-red-600" />
            <StatCard label="Serious" value={data.seriousCount} accent="text-orange-600" />
          </div>
          <SeverityDonut
            criticalCount={data.criticalCount}
            seriousCount={data.seriousCount}
            moderateCount={moderateCount > 0 ? moderateCount : 0}
            minorCount={0}
          />
        </div>

        {/* Top 3 Priority Actions */}
        {data.topActions.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Top Priorities
            </h3>
            <div className="space-y-2">
              {data.topActions.map((action, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{action.title}</span>
                      <SeverityBadge severity={action.severity} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {action.reason}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {action.affectedPages} page{action.affectedPages !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className={`text-2xl font-bold ${accent ?? ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  SERIOUS: 'bg-orange-100 text-orange-800',
  MODERATE: 'bg-yellow-100 text-yellow-800',
  MINOR: 'bg-blue-100 text-blue-800',
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[severity] ?? ''}`}
    >
      {severity}
    </span>
  );
}
