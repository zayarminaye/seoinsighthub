'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditProgress } from '@/hooks/useAuditProgress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 15;

interface AuditData {
  id: string;
  targetDomain: string;
  status: string;
  totalPages: number;
  completedPages: number;
  currentStep: number | null;
  currentStepName: string | null;
  uraScoreU: number | null;
  uraScoreR: number | null;
  uraScoreA: number | null;
  uraScoreOverall: number | null;
  createdAt: string;
  completedAt: string | null;
  pageCount: number;
  issueCount: number;
}

interface IssueData {
  id: string;
  stepNumber: number;
  severity: string;
  category: string;
  message: string;
  recommendation: string | null;
  url: string | null;
}

interface PageData {
  id: string;
  url: string;
  httpStatus: number | null;
  crawlDepth: number | null;
  performanceScore: number | null;
  inpValue: number | null;
  inpRating: string | null;
  mobileFriendly: boolean | null;
  accessibilityScore: number | null;
  domNodeCount: number | null;
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  SERIOUS: 'bg-orange-100 text-orange-800',
  MODERATE: 'bg-yellow-100 text-yellow-800',
  MINOR: 'bg-blue-100 text-blue-800',
};

function ScoreCard({
  score,
  label,
}: {
  score: number | null;
  label: string;
}) {
  if (score === null) return null;
  const color =
    score >= 80
      ? 'border-green-200 bg-green-50'
      : score >= 50
        ? 'border-yellow-200 bg-yellow-50'
        : 'border-red-200 bg-red-50';
  const textColor =
    score >= 80 ? 'text-green-700' : score >= 50 ? 'text-yellow-700' : 'text-red-700';

  return (
    <Card className={`${color} border`}>
      <CardContent className="py-4 text-center">
        <div className={`text-3xl font-bold ${textColor}`}>{score}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
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

export default function AuditDetailClient({
  audit,
  issues,
  pages,
}: {
  audit: AuditData;
  issues: IssueData[];
  pages: PageData[];
}) {
  const router = useRouter();
  const isRunning = ['QUEUED', 'CRAWLING', 'RUNNING'].includes(audit.status);
  const progress = useAuditProgress(audit.id, isRunning);
  const [issuesPage, setIssuesPage] = useState(1);
  const [pagesPage, setPagesPage] = useState(1);
  const hasRefreshedRef = useRef(false);

  // Auto-refresh once when audit transitions to a terminal state.
  useEffect(() => {
    const done =
      progress?.status === 'COMPLETED' || progress?.status === 'FAILED';
    if (!done || hasRefreshedRef.current) return;
    hasRefreshedRef.current = true;
    router.refresh();
  }, [progress?.status, router]);

  const currentStatus = progress?.status ?? audit.status;
  const currentStepName = progress?.currentStepName ?? audit.currentStepName;
  const pct = progress?.percentComplete ?? (audit.totalPages > 0
    ? Math.round((audit.completedPages / audit.totalPages) * 100)
    : 0);

  // Paginate issues
  const issuesTotalPages = Math.ceil(issues.length / PAGE_SIZE);
  const paginatedIssues = issues.slice(
    (issuesPage - 1) * PAGE_SIZE,
    issuesPage * PAGE_SIZE
  );

  // Paginate pages
  const pagesTotalPages = Math.ceil(pages.length / PAGE_SIZE);
  const paginatedPages = pages.slice(
    (pagesPage - 1) * PAGE_SIZE,
    pagesPage * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{audit.targetDomain}</h1>
          <p className="text-sm text-muted-foreground">
            Started {new Date(audit.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
          </p>
        </div>
        <Badge
          variant={
            currentStatus === 'COMPLETED'
              ? 'default'
              : currentStatus === 'FAILED'
                ? 'destructive'
                : 'secondary'
          }
          className="text-sm"
        >
          {currentStatus}
        </Badge>
      </div>

      {/* Progress (while running) */}
      {isRunning && (
        <Card>
          <CardContent className="py-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">
                {currentStepName ?? 'Starting...'}
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-3" />
            <p className="mt-2 text-xs text-muted-foreground">
              {progress?.urlsProcessed ?? audit.completedPages} of{' '}
              {progress?.urlsTotal ?? audit.totalPages} pages processed
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scores (when completed) */}
      {audit.status === 'COMPLETED' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <ScoreCard score={audit.uraScoreOverall} label="Overall" />
          <ScoreCard score={audit.uraScoreU} label="Usability" />
          <ScoreCard score={audit.uraScoreR} label="Relevance" />
          <ScoreCard score={audit.uraScoreA} label="Authority" />
        </div>
      )}

      {/* Tabs: Issues / Pages */}
      {audit.status === 'COMPLETED' && (
        <Tabs defaultValue="issues">
          <TabsList>
            <TabsTrigger value="issues">
              Issues ({audit.issueCount})
            </TabsTrigger>
            <TabsTrigger value="pages">
              Pages ({audit.pageCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="issues" className="mt-4">
            {issues.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No issues found. Great job!
                </CardContent>
              </Card>
            ) : (
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
                      {paginatedIssues.map((issue) => (
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
                            <div className="text-sm font-medium">
                              {issue.category}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {issue.message}
                            </div>
                            {issue.recommendation && (
                              <div className="mt-1 text-xs text-blue-600">
                                {issue.recommendation}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:table-cell">
                            {issue.url}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    currentPage={issuesPage}
                    totalPages={issuesTotalPages}
                    onPageChange={setIssuesPage}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pages" className="mt-4">
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
                    {paginatedPages.map((page) => (
                      <TableRow key={page.id}>
                        <TableCell className="max-w-[250px] truncate text-sm">
                          {page.url}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <span
                            className={
                              page.httpStatus && page.httpStatus >= 400
                                ? 'text-red-600'
                                : ''
                            }
                          >
                            {page.httpStatus ?? '-'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <span
                            className={
                              page.crawlDepth !== null && page.crawlDepth > 3
                                ? 'text-orange-600'
                                : ''
                            }
                          >
                            {page.crawlDepth ?? '-'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <ScoreChip value={page.performanceScore} />
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {page.inpValue !== null
                            ? `${Math.round(page.inpValue)}ms`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {page.mobileFriendly !== null
                            ? page.mobileFriendly
                              ? 'Yes'
                              : 'No'
                            : '-'}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <ScoreChip value={page.accessibilityScore} />
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          <span
                            className={
                              page.domNodeCount !== null &&
                              page.domNodeCount > 1400
                                ? 'text-orange-600'
                                : ''
                            }
                          >
                            {page.domNodeCount ?? '-'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={pagesPage}
                  totalPages={pagesTotalPages}
                  onPageChange={setPagesPage}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ScoreChip({ value }: { value: number | null }) {
  if (value === null) return <span>-</span>;
  const color =
    value >= 80
      ? 'text-green-600'
      : value >= 50
        ? 'text-yellow-600'
        : 'text-red-600';
  return <span className={`font-medium ${color}`}>{Math.round(value)}</span>;
}
