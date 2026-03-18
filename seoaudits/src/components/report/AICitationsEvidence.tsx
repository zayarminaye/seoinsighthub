'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface AICitationEvidenceItem {
  queryText: string;
  seedKeyword: string;
  platform: string;
  clientCited: boolean;
  citedDomains: string[];
  competitorsCited: string[];
  citationContext: string | null;
  gaps: Array<{
    competitorDomain: string;
    gapType: string;
    priority: number;
    recommendedAction: string | null;
  }>;
}

export interface AICitationConfidence {
  attemptedQueries: number;
  successfulQueries: number;
  failedQueries: number;
  confidenceScore: number | null;
}

export interface AICitationConfidenceHistoryPoint {
  auditRunId: string;
  completedAt: string | null;
  attemptedQueries: number;
  successfulQueries: number;
  confidenceScore: number | null;
}

function formatHistoryDate(iso: string | null): string {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function collectTopDomains(rows: AICitationEvidenceItem[]): Array<{ domain: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const domain of row.citedDomains) {
      const normalized = domain.trim().toLowerCase();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function collectTopGaps(rows: AICitationEvidenceItem[]) {
  return rows
    .flatMap((row) => row.gaps)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 12);
}

function collectCompetitorMentions(rows: AICitationEvidenceItem[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const domain of row.competitorsCited) {
      const normalized = domain.trim().toLowerCase();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildActionPlan(rows: AICitationEvidenceItem[]) {
  const actionMap = new Map<string, { key: string; count: number; maxPriority: number; action: string }>();
  for (const gap of rows.flatMap((r) => r.gaps)) {
    const action = (gap.recommendedAction ?? '').trim();
    if (!action) continue;
    const key = `${gap.gapType}|${gap.competitorDomain}|${action.toLowerCase()}`;
    const current = actionMap.get(key);
    if (!current) {
      actionMap.set(key, {
        key,
        count: 1,
        maxPriority: gap.priority,
        action: `${gap.gapType} vs ${gap.competitorDomain}: ${action}`,
      });
    } else {
      current.count += 1;
      current.maxPriority = Math.max(current.maxPriority, gap.priority);
    }
  }

  return [...actionMap.values()]
    .sort((a, b) => {
      if (b.maxPriority !== a.maxPriority) return b.maxPriority - a.maxPriority;
      return b.count - a.count;
    })
    .slice(0, 6);
}

function getConfidenceBand(score: number | null): {
  label: string;
  tone: string;
  hint: string;
} {
  if (score === null) {
    return {
      label: 'No data',
      tone: 'text-muted-foreground',
      hint: 'Run citation analysis to compute confidence.',
    };
  }
  if (score >= 85) {
    return {
      label: 'High confidence',
      tone: 'text-green-700',
      hint: 'Evidence is broad enough for strong directional decisions.',
    };
  }
  if (score >= 60) {
    return {
      label: 'Medium confidence',
      tone: 'text-yellow-700',
      hint: 'Useful for prioritization; increase query coverage for stronger certainty.',
    };
  }
  return {
    label: 'Low confidence',
    tone: 'text-red-700',
    hint: 'Too many failed model calls; treat findings as preliminary.',
  };
}

export default function AICitationsEvidence({
  rows,
  confidence,
  history,
}: {
  rows: AICitationEvidenceItem[];
  confidence: AICitationConfidence;
  history: AICitationConfidenceHistoryPoint[];
}) {
  const [briefCopied, setBriefCopied] = useState(false);
  const total = rows.length;
  const cited = rows.filter((r) => r.clientCited).length;
  const topDomains = collectTopDomains(rows);
  const topGaps = collectTopGaps(rows);
  const missedIntents = rows.filter((r) => !r.clientCited).slice(0, 8);
  const competitorMentions = collectCompetitorMentions(rows);
  const actionPlan = buildActionPlan(rows);
  const confidenceMeta = getConfidenceBand(confidence.confidenceScore);
  const briefText = useMemo(() => {
    if (rows.length === 0) return '';
    const lines: string[] = [];
    lines.push('# AI Citation Content Brief');
    lines.push('');
    lines.push(`- Sampled queries: ${total}`);
    lines.push(`- Client citation rate: ${pct(cited, total)}%`);
    lines.push('');
    lines.push('## Priority Intents (Not Cited)');
    if (missedIntents.length === 0) {
      lines.push('- None');
    } else {
      for (const intent of missedIntents.slice(0, 8)) {
        lines.push(`- ${intent.queryText}`);
      }
    }
    lines.push('');
    lines.push('## Competitor Citation Leaders');
    if (competitorMentions.length === 0) {
      lines.push('- No competitor dominance detected');
    } else {
      for (const comp of competitorMentions.slice(0, 5)) {
        lines.push(`- ${comp.domain} (${comp.count} mentions)`);
      }
    }
    lines.push('');
    lines.push('## Recommended Actions');
    if (actionPlan.length === 0) {
      lines.push('- No prioritized actions generated');
    } else {
      for (const [index, action] of actionPlan.slice(0, 6).entries()) {
        lines.push(`${index + 1}. ${action.action} (priority ${action.maxPriority}, seen ${action.count}x)`);
      }
    }
    return lines.join('\n');
  }, [actionPlan, cited, competitorMentions, missedIntents, rows.length, total]);

  async function copyBrief() {
    if (!briefText) return;
    try {
      await navigator.clipboard.writeText(briefText);
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 1500);
    } catch {
      setBriefCopied(false);
    }
  }

  function downloadBrief() {
    if (!briefText) return;
    const blob = new Blob([briefText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-citation-content-brief.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Citations Evidence</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No model-backed citation results yet. Run citation analysis to populate this section.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Analyzed Queries</div>
                <div className="mt-1 text-2xl font-semibold">{total}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Client Citation Rate</div>
                <div className="mt-1 text-2xl font-semibold">{pct(cited, total)}%</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Queries With Gaps</div>
                <div className="mt-1 text-2xl font-semibold">
                  {rows.filter((r) => r.gaps.length > 0).length}
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-1 text-sm font-semibold">Evidence Confidence</div>
              <div className={`text-xl font-semibold ${confidenceMeta.tone}`}>
                {confidence.confidenceScore !== null ? `${confidence.confidenceScore}/100` : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                {confidenceMeta.label}. {confidenceMeta.hint}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Successful model queries: {confidence.successfulQueries}/{confidence.attemptedQueries}
                {confidence.failedQueries > 0 ? ` (${confidence.failedQueries} failed)` : ''}
              </p>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-semibold">Confidence Trend</div>
              {history.length <= 1 ? (
                <p className="text-xs text-muted-foreground">
                  Not enough historical audits yet. Run this domain multiple times to see trend.
                </p>
              ) : (
                <div className="space-y-2">
                  {history.slice(0, 6).map((point) => {
                    const width = Math.max(0, Math.min(100, point.confidenceScore ?? 0));
                    return (
                      <div key={point.auditRunId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{formatHistoryDate(point.completedAt)}</span>
                          <span className="font-medium">
                            {point.confidenceScore !== null ? `${point.confidenceScore}/100` : 'N/A'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded bg-muted/60">
                          <div className="h-full rounded bg-emerald-500/80" style={{ width: `${width}%` }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {point.successfulQueries}/{point.attemptedQueries} successful queries
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-semibold">Top Cited Domains</div>
                {topDomains.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No citation domains captured.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topDomains.map((item) => (
                      <Badge key={item.domain} variant="secondary">
                        {item.domain} ({item.count})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-semibold">Top Gap Actions</div>
                {topGaps.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No prioritized gap actions yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {topGaps.slice(0, 5).map((gap, index) => (
                      <li key={`${gap.competitorDomain}-${gap.gapType}-${index}`} className="text-xs">
                        <span className="font-medium">P{gap.priority}</span> {gap.gapType} vs{' '}
                        <span className="font-medium">{gap.competitorDomain}</span>
                        {gap.recommendedAction ? ` - ${gap.recommendedAction}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-semibold">Missed Intents (Not Cited)</div>
                {missedIntents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Your domain was cited for all sampled intents.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {missedIntents.map((item, index) => (
                      <li key={`${item.queryText}-${index}`} className="text-xs">
                        <span className="font-medium">{item.queryText}</span>
                        <div className="text-muted-foreground">
                          Competitors cited: {item.competitorsCited.slice(0, 3).join(', ') || 'N/A'}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-semibold">Competitor Citation Share</div>
                {competitorMentions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No competitor citation data captured yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {competitorMentions.map((item) => (
                      <li key={item.domain} className="flex items-center justify-between text-xs">
                        <span>{item.domain}</span>
                        <span className="font-medium">{item.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-semibold">Prioritized Action Plan</div>
              {actionPlan.length === 0 ? (
                <p className="text-xs text-muted-foreground">No actionable gap recommendations available.</p>
              ) : (
                <ol className="space-y-2">
                  {actionPlan.map((item, index) => (
                    <li key={item.key} className="text-xs">
                      <span className="mr-2 font-semibold">{index + 1}.</span>
                      {item.action}
                      <span className="ml-2 text-muted-foreground">
                        (priority {item.maxPriority}, seen {item.count}x)
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Content Brief Draft</div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={copyBrief} disabled={!briefText}>
                    {briefCopied ? 'Copied' : 'Copy brief'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={downloadBrief} disabled={!briefText}>
                    Download .md
                  </Button>
                </div>
              </div>
              {briefText ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
                  {briefText}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Brief will appear when citation evidence data is available.
                </p>
              )}
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="hidden md:table-cell">Keyword</TableHead>
                    <TableHead className="w-24">Client</TableHead>
                    <TableHead className="hidden lg:table-cell">Top Domains</TableHead>
                    <TableHead className="w-20 text-right">Gaps</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 20).map((row, index) => (
                    <TableRow key={`${row.queryText}-${row.platform}-${index}`}>
                      <TableCell className="text-sm">{row.queryText}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {row.seedKeyword}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.clientCited ? 'default' : 'outline'}>
                          {row.clientCited ? 'Cited' : 'Not cited'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {row.citedDomains.slice(0, 3).join(', ') || '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{row.gaps.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
