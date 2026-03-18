'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ScoreBar from './charts/ScoreBar';
import type { ScoreBreakdown as ScoreBreakdownData } from '@/services/audit/reportInsights';

const STATUS_STYLE: Record<string, string> = {
  good: 'border-green-200 bg-green-50',
  warning: 'border-yellow-200 bg-yellow-50',
  poor: 'border-red-200 bg-red-50',
};

const STATUS_TEXT: Record<string, string> = {
  good: 'text-green-700',
  warning: 'text-yellow-700',
  poor: 'text-red-700',
};

interface Props {
  data: ScoreBreakdownData;
}

const PILLARS = [
  { label: 'Usability', scoreKey: 'usabilityScore' as const, start: 0, count: 7, weight: '35%' },
  { label: 'Relevance', scoreKey: 'relevanceScore' as const, start: 7, count: 7, weight: '35%' },
  { label: 'Authority', scoreKey: 'authorityScore' as const, start: 14, count: 4, weight: '30%' },
];

export default function ScoreBreakdown({ data }: Props) {
  if (data.components.length === 0) return null;

  return (
    <div className="space-y-6">
      {PILLARS.map((pillar) => {
        const components = data.components.slice(pillar.start, pillar.start + pillar.count);
        if (components.length === 0) return null;
        const pillarScore = data[pillar.scoreKey];

        return (
          <Card key={pillar.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{pillar.label} Score Breakdown</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Weight: {pillar.weight}</span>
                  {pillarScore !== null && (
                    <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${
                      pillarScore >= 80 ? 'bg-green-100 text-green-700' :
                      pillarScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {pillarScore}/100
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ScoreBar components={components} />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {components.map((comp) => (
                  <div
                    key={comp.name}
                    className={`rounded-lg border p-3 ${STATUS_STYLE[comp.status]}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{comp.name}</span>
                      <span className="text-xs text-muted-foreground">{comp.weightLabel}</span>
                    </div>
                    <div className={`mt-1 text-xl font-bold ${STATUS_TEXT[comp.status]}`}>
                      {comp.score !== null ? comp.score : '—'}
                      <span className="text-sm font-normal text-muted-foreground">/100</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{comp.benchmark}</p>
                    <p className="mt-2 text-xs">{comp.insight}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
