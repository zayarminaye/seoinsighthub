'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PriorityAction } from '@/services/audit/reportInsights';

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  SERIOUS: 'bg-orange-100 text-orange-800',
  MODERATE: 'bg-yellow-100 text-yellow-800',
  MINOR: 'bg-blue-100 text-blue-800',
};

const GROUP_STYLE: Record<string, { border: string; title: string; desc: string }> = {
  'critical-fixes': {
    border: 'border-l-red-500',
    title: 'Critical Fixes',
    desc: 'High-impact issues that should be addressed first',
  },
  'quick-wins': {
    border: 'border-l-yellow-500',
    title: 'Quick Wins',
    desc: 'Lower severity issues that are often easy to fix',
  },
};

interface Props {
  actions: PriorityAction[];
}

export default function PriorityActions({ actions }: Props) {
  if (actions.length === 0) return null;

  const criticalFixes = actions.filter((a) => a.group === 'critical-fixes');
  const quickWins = actions.filter((a) => a.group === 'quick-wins');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Priority Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {criticalFixes.length > 0 && (
          <ActionGroup group="critical-fixes" actions={criticalFixes} />
        )}
        {quickWins.length > 0 && (
          <ActionGroup group="quick-wins" actions={quickWins} />
        )}
      </CardContent>
    </Card>
  );
}

function ActionGroup({
  group,
  actions,
}: {
  group: string;
  actions: PriorityAction[];
}) {
  const style = GROUP_STYLE[group] ?? GROUP_STYLE['quick-wins'];

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{style.title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{style.desc}</p>
      <div className="space-y-3">
        {actions.map((action, i) => (
          <div
            key={i}
            className={`rounded-lg border border-l-4 p-4 ${style.border}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[action.severity] ?? ''}`}
              >
                {action.severity}
              </span>
              <span className="text-sm font-medium">{action.category}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {action.affectedPageCount > 0
                  ? `${action.affectedPageCount} page${action.affectedPageCount !== 1 ? 's' : ''}`
                  : 'Site-level / query-level'}
              </span>
            </div>
            <p className="mt-2 text-sm">{action.problem}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {action.whyItMatters}
            </p>
            <div className="mt-2 rounded bg-blue-50 p-2 text-xs text-blue-800">
              <span className="font-medium">How to fix: </span>
              {action.howToFix}
            </div>
            {action.sampleUrls.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">Affected: </span>
                {action.sampleUrls.map((url, j) => (
                  <span key={j} className="mr-2 truncate">
                    {url}{j < action.sampleUrls.length - 1 ? ',' : ''}
                  </span>
                ))}
                {action.affectedPageCount > 3 && (
                  <span>and {action.affectedPageCount - 3} more</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
