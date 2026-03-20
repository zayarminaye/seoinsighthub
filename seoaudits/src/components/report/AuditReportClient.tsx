'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ExecutiveSummary from './ExecutiveSummary';
import ScoreBreakdown from './ScoreBreakdown';
import PriorityActions from './PriorityActions';
import StepInsights from './StepInsights';
import WorstPerformers from './WorstPerformers';
import AICitationsEvidence, {
  type AICitationEvidenceItem,
  type AICitationConfidence,
  type AICitationConfidenceHistoryPoint,
} from './AICitationsEvidence';
import type { ReportData, ReportIssueInput, ReportPageInput } from '@/services/audit/reportInsights';

const PAGE_SIZE = 15;

/** Deterministic date format to avoid SSR/client hydration mismatch */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  SERIOUS: 'bg-orange-100 text-orange-800',
  MODERATE: 'bg-yellow-100 text-yellow-800',
  MINOR: 'bg-blue-100 text-blue-800',
};

interface AuditMeta {
  id: string;
  targetDomain: string;
  createdAt: string;
  completedAt: string | null;
  pageCount: number;
  issueCount: number;
}

interface Props {
  audit: AuditMeta;
  report: ReportData;
  canExportPdf: boolean;
  canExportCsv: boolean;
  canExportAiCsv: boolean;
  canExportAiHistoryCsv: boolean;
  canExportJson: boolean;
  canRunCitationAnalysis: boolean;
  aiCitationEvidence: AICitationEvidenceItem[];
  aiCitationConfidence: AICitationConfidence;
  aiCitationConfidenceHistory: AICitationConfidenceHistoryPoint[];
}

export default function AuditReportClient({
  audit,
  report,
  canExportPdf,
  canExportCsv,
  canExportAiCsv,
  canExportAiHistoryCsv,
  canExportJson,
  canRunCitationAnalysis,
  aiCitationEvidence,
  aiCitationConfidence,
  aiCitationConfidenceHistory,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{audit.targetDomain}</h1>
          <p className="text-sm text-muted-foreground">
            Completed {audit.completedAt ? formatDate(audit.completedAt) : 'N/A'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canRunCitationAnalysis && <RerunAICitationsButton auditId={audit.id} />}
          <ExportButtons
            auditId={audit.id}
            canExportPdf={canExportPdf}
            canExportCsv={canExportCsv}
            canExportAiCsv={canExportAiCsv}
            canExportAiHistoryCsv={canExportAiHistoryCsv}
            canExportJson={canExportJson}
          />
          <Badge variant="default" className="text-sm">
            COMPLETED
          </Badge>
        </div>
      </div>

      {/* Report Sections */}
      <ExecutiveSummary data={report.executive} />
      <ScoreBreakdown data={report.scoreBreakdown} />
      <PriorityActions actions={report.priorityActions} />
      <StepInsights steps={report.stepInsights} />
      <AICitationsEvidence
        rows={aiCitationEvidence}
        confidence={aiCitationConfidence}
        history={aiCitationConfidenceHistory}
      />
      <WorstPerformers performers={report.worstPerformers} />

      {/* Detailed Tables */}
      <Tabs defaultValue="issues">
        <TabsList>
          <TabsTrigger value="issues">All Issues ({report.issues.length})</TabsTrigger>
          <TabsTrigger value="pages">All Pages ({report.pages.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="mt-4">
          <IssuesTable issues={report.issues} />
        </TabsContent>

        <TabsContent value="pages" className="mt-4">
          <PagesTable pages={report.pages} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Issues Table ───────────────────────────────────────────────

function IssuesTable({ issues }: { issues: ReportIssueInput[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(issues.length / PAGE_SIZE);
  const paginated = issues.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (issues.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No issues found. Great job!
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Severity</TableHead>
              <TableHead className="w-16">Step</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead className="hidden md:table-cell">URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOR[issue.severity] ?? ''}`}
                  >
                    {issue.severity}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {issue.stepNumber}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{issue.category}</div>
                  <div className="text-xs text-muted-foreground">{issue.message}</div>
                  {issue.recommendation && (
                    <div className="mt-1 text-xs text-blue-600">{issue.recommendation}</div>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:table-cell">
                  {issue.url}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}

// ─── Pages Table ────────────────────────────────────────────────

function PagesTable({ pages }: { pages: ReportPageInput[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(pages.length / PAGE_SIZE);
  const paginated = pages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead className="w-16 text-center">Status</TableHead>
              <TableHead className="w-16 text-center">Depth</TableHead>
              <TableHead className="w-16 text-center">Perf</TableHead>
              <TableHead className="w-16 text-center">INP</TableHead>
              <TableHead className="w-16 text-center">Mobile</TableHead>
              <TableHead className="w-16 text-center">A11y</TableHead>
              <TableHead className="w-16 text-center">DOM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-[250px] truncate text-sm">{p.url}</TableCell>
                <TableCell className="text-center text-sm">
                  <span className={p.httpStatus && p.httpStatus >= 400 ? 'text-red-600' : ''}>
                    {p.httpStatus ?? '-'}
                  </span>
                </TableCell>
                <TableCell className="text-center text-sm">
                  <span className={p.crawlDepth !== null && p.crawlDepth > 3 ? 'text-orange-600' : ''}>
                    {p.crawlDepth ?? '-'}
                  </span>
                </TableCell>
                <TableCell className="text-center text-sm">
                  <ScoreChip value={p.performanceScore} />
                </TableCell>
                <TableCell className="text-center text-sm">
                  {p.inpValue !== null ? `${Math.round(p.inpValue)}ms` : '-'}
                </TableCell>
                <TableCell className="text-center text-sm">
                  {p.mobileFriendly !== null ? (p.mobileFriendly ? 'Yes' : 'No') : '-'}
                </TableCell>
                <TableCell className="text-center text-sm">
                  <ScoreChip value={p.accessibilityScore} />
                </TableCell>
                <TableCell className="text-center text-sm">
                  <span className={p.domNodeCount !== null && p.domNodeCount > 1400 ? 'text-orange-600' : ''}>
                    {p.domNodeCount ?? '-'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}

// ─── Export Buttons ─────────────────────────────────────────────

function ExportButtons({
  auditId,
  canExportPdf,
  canExportCsv,
  canExportAiCsv,
  canExportAiHistoryCsv,
  canExportJson,
}: {
  auditId: string;
  canExportPdf: boolean;
  canExportCsv: boolean;
  canExportAiCsv: boolean;
  canExportAiHistoryCsv: boolean;
  canExportJson: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: string, extension: string) => {
    setLoading(format);
    setError(null);
    try {
      const res = await fetch(`/api/audits/${auditId}/export/${format}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data.error === 'string' && data.error.trim()) {
            message = data.error;
          }
        } catch {
          // Keep default message
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      if (blob.size === 0) {
        throw new Error('Export returned an empty file.');
      }

      const disposition = res.headers.get('content-disposition');
      const filenameMatch = disposition?.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] ?? `audit-${auditId}.${extension}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-1">
        {canExportPdf && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('pdf', 'pdf')}
            disabled={loading !== null}
          >
            {loading === 'pdf' ? 'Generating...' : 'PDF'}
          </Button>
        )}
        {canExportCsv && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('pages-csv', 'csv')}
              disabled={loading !== null}
            >
              {loading === 'pages-csv' ? 'Exporting...' : 'Pages CSV'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('issues-csv', 'csv')}
              disabled={loading !== null}
            >
              {loading === 'issues-csv' ? 'Exporting...' : 'Issues CSV'}
            </Button>
            {canExportAiCsv && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('ai-citations-csv', 'csv')}
                disabled={loading !== null}
              >
                {loading === 'ai-citations-csv' ? 'Exporting...' : 'AI CSV'}
              </Button>
            )}
            {canExportAiHistoryCsv && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('ai-citations-history-csv', 'csv')}
                disabled={loading !== null}
              >
                {loading === 'ai-citations-history-csv' ? 'Exporting...' : 'AI Trend CSV'}
              </Button>
            )}
          </>
        )}
        {canExportJson && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('json', 'json')}
            disabled={loading !== null}
          >
            JSON
          </Button>
        )}
      </div>
      {error && (
        <p className="absolute right-0 top-full z-30 mt-2 w-72 rounded-md border border-destructive/30 bg-background p-2 text-xs text-destructive shadow-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function RerunAICitationsButton({ auditId }: { auditId: string }) {
  const [loading, setLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [seedKeywordsText, setSeedKeywordsText] = useState('');
  const [competitorDomainsText, setCompetitorDomainsText] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function parseCommaSeparated(value: string): string[] {
    return value
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  useEffect(() => {
    if (!showManualInputs) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowManualInputs(false);
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showManualInputs]);

  async function rerun() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/audits/${auditId}/citations/rerun`, {
        method: 'POST',
      });
      const raw = await res.text();
      let body: { message?: string; error?: string; code?: string } = {};
      try {
        body = JSON.parse(raw) as { message?: string; error?: string; code?: string };
      } catch {}
      if (!res.ok) {
        if (body.code === 'MISSING_CITATION_INPUTS') {
          setShowManualInputs(true);
        }
        throw new Error(body.error ?? `Failed to queue re-run (HTTP ${res.status}).`);
      }
      setStatus({
        type: 'success',
        message: body.message ?? 'Citation analysis re-run queued.',
      });
      setShowManualInputs(false);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to queue re-run.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function runWithManualInputs() {
    setManualLoading(true);
    setStatus(null);
    try {
      const seedKeywords = parseCommaSeparated(seedKeywordsText);
      const competitorDomains = parseCommaSeparated(competitorDomainsText);
      if (seedKeywords.length < 5) {
        throw new Error('Please provide at least 5 seed keywords.');
      }
      if (competitorDomains.length < 1) {
        throw new Error('Please provide at least 1 competitor domain.');
      }

      const res = await fetch(`/api/audits/${auditId}/citations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedKeywords,
          competitorDomains,
          queriesPerKeyword: 4,
        }),
      });
      const raw = await res.text();
      let body: { message?: string; error?: string } = {};
      try {
        body = JSON.parse(raw) as { message?: string; error?: string };
      } catch {}

      if (!res.ok) {
        throw new Error(body.error ?? `Failed to queue citation analysis (HTTP ${res.status}).`);
      }

      setStatus({
        type: 'success',
        message: body.message ?? 'Citation analysis queued.',
      });
      setShowManualInputs(false);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to queue citation analysis.',
      });
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={rerun} disabled={loading || manualLoading}>
          {loading ? 'Queueing...' : 'Re-run AI Citations'}
        </Button>
      </div>
      {status && (
        <p
          className={`absolute left-0 top-full z-30 mt-2 w-80 rounded-md border bg-background p-2 text-xs shadow-sm ${
            status.type === 'success'
              ? 'border-green-300/60 text-green-700'
              : 'border-destructive/30 text-destructive'
          }`}
        >
          {status.message}
        </p>
      )}
      {showManualInputs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowManualInputs(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Citation analysis input form"
            className="w-full max-w-xl space-y-4 rounded-xl border bg-background p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Run Citation Analysis</h3>
                <p className="text-xs text-muted-foreground">
                  This audit has no saved citation inputs. Add them below to run now.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowManualInputs(false)}
                disabled={manualLoading}
                className="h-8 px-2"
              >
                Close
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Seed Keywords (comma-separated, min 5)</label>
              <textarea
                className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                value={seedKeywordsText}
                onChange={(e) => setSeedKeywordsText(e.target.value)}
                placeholder="ai job application tracker, linkedin job tracker extension, ..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Competitor Domains (comma-separated)</label>
              <textarea
                className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                value={competitorDomainsText}
                onChange={(e) => setCompetitorDomainsText(e.target.value)}
                placeholder="workwise-ai.com, wizapply.app"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowManualInputs(false)}
                disabled={manualLoading}
              >
                Cancel
              </Button>
              <Button type="button" onClick={runWithManualInputs} disabled={manualLoading}>
                {manualLoading ? 'Queueing...' : 'Run with these inputs'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared components ──────────────────────────────────────────

function ScoreChip({ value }: { value: number | null }) {
  if (value === null) return <span>-</span>;
  const color =
    value >= 80 ? 'text-green-600' : value >= 50 ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-medium ${color}`}>{Math.round(value)}</span>;
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
