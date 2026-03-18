'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { WorstPerformer } from '@/services/audit/reportInsights';

function ScoreChip({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const color =
    value >= 80
      ? 'text-green-600'
      : value >= 50
        ? 'text-yellow-600'
        : 'text-red-600';
  return (
    <span className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      <span className={`font-medium ${color}`}>{Math.round(value)}</span>
    </span>
  );
}

interface Props {
  performers: WorstPerformer[];
}

export default function WorstPerformers({ performers }: Props) {
  if (performers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pages Needing Most Attention</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {performers.map((page, i) => (
          <div key={page.url} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{page.url}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {page.criticalCount > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
                      {page.criticalCount} critical
                    </span>
                  )}
                  {page.seriousCount > 0 && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800">
                      {page.seriousCount} serious
                    </span>
                  )}
                  {page.issueCount - page.criticalCount - page.seriousCount > 0 && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800">
                      {page.issueCount - page.criticalCount - page.seriousCount} other
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {page.issueCount} total issue{page.issueCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  <ScoreChip value={page.performanceScore} label="Perf" />
                  <ScoreChip value={page.accessibilityScore} label="A11y" />
                </div>
                {page.failedSteps.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {page.failedSteps.map((step) => (
                      <Badge key={step.stepNumber} variant="outline" className="text-[10px]">
                        Step {step.stepNumber}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
