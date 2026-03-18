'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { StepInsight, ReportIssueInput } from '@/services/audit/reportInsights';

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  SERIOUS: 'bg-orange-100 text-orange-800',
  MODERATE: 'bg-yellow-100 text-yellow-800',
  MINOR: 'bg-blue-100 text-blue-800',
};

const STATUS_BADGE: Record<string, string> = {
  good: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  poor: 'bg-red-100 text-red-800',
};

const ISSUES_PER_PAGE = 10;

interface Props {
  steps: StepInsight[];
}

export default function StepInsights({ steps }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Step-by-Step Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {steps.map((step) => (
            <AccordionItem key={step.stepNumber} value={`step-${step.stepNumber}`}>
              <AccordionTrigger className="text-sm hover:no-underline">
                <div className="flex w-full items-center gap-3 pr-4">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {step.stepNumber}
                  </span>
                  <span className="flex-1 text-left font-medium">{step.stepName}</span>
                  <PassFailBadge
                    passCount={step.passCount}
                    totalRelevant={step.totalRelevant}
                    status={step.status}
                  />
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <StepContent step={step} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function PassFailBadge({
  passCount,
  totalRelevant,
  status,
}: {
  passCount: number;
  totalRelevant: number;
  status: string;
}) {
  if (totalRelevant === 0) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        No data
      </span>
    );
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status] ?? ''}`}>
      {passCount}/{totalRelevant} passed
    </span>
  );
}

function StepContent({ step }: { step: StepInsight }) {
  return (
    <div className="space-y-4 pt-2">
      {/* Key Metric */}
      {step.keyMetric && (
        <div className={`rounded-lg border p-3 ${
          step.keyMetric.status === 'good'
            ? 'border-green-200 bg-green-50'
            : step.keyMetric.status === 'warning'
              ? 'border-yellow-200 bg-yellow-50'
              : 'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{step.keyMetric.label}</span>
            <span className={`text-lg font-bold ${
              step.keyMetric.status === 'good'
                ? 'text-green-700'
                : step.keyMetric.status === 'warning'
                  ? 'text-yellow-700'
                  : 'text-red-700'
            }`}>
              {step.keyMetric.value}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{step.keyMetric.benchmark}</p>
        </div>
      )}

      {/* Positive Signals */}
      {step.positiveSignals.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
            What&apos;s working well
          </h4>
          <ul className="space-y-1">
            {step.positiveSignals.map((signal, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-green-600">&#10003;</span>
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issues Table */}
      {step.issues.length > 0 && (
        <StepIssuesTable issues={step.issues} />
      )}

      {step.issues.length === 0 && step.totalRelevant > 0 && (
        <p className="text-sm text-muted-foreground">No issues found in this step.</p>
      )}
    </div>
  );
}

function StepIssuesTable({ issues }: { issues: ReportIssueInput[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(issues.length / ISSUES_PER_PAGE);
  const paginated = issues.slice((page - 1) * ISSUES_PER_PAGE, page * ISSUES_PER_PAGE);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Issues Found ({issues.length})
      </h4>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Severity</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead className="hidden md:table-cell">URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLOR[issue.severity] ?? ''}`}
                  >
                    {issue.severity}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{issue.message}</div>
                  {issue.recommendation && (
                    <div className="mt-0.5 text-xs text-blue-600">{issue.recommendation}</div>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:table-cell">
                  {issue.url}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-2">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
