import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExecutiveSummary from './ExecutiveSummary';
import type { ExecutiveSummary as ExecutiveSummaryData } from '@/services/audit/reportInsights';

vi.mock('./charts/SeverityDonut', () => ({
  default: () => '<div data-testid="severity-donut" />',
}));

function makeData(overrides: Partial<ExecutiveSummaryData> = {}): ExecutiveSummaryData {
  return {
    overallScore: 82,
    grade: 'B',
    gradeColor: 'green',
    verdict: 'Good usability fundamentals.',
    pagesAudited: 12,
    totalIssues: 9,
    criticalCount: 1,
    seriousCount: 2,
    topActions: [
      {
        title: 'Fix missing HSTS',
        reason: 'Improves transport security and trust',
        affectedPages: 4,
        severity: 'CRITICAL',
      },
      {
        title: 'Add meta descriptions',
        reason: 'Improve CTR in search results',
        affectedPages: 6,
        severity: 'SERIOUS',
      },
    ],
    ...overrides,
  };
}

describe('ExecutiveSummary', () => {
  it('renders score, verdict, and top priorities', () => {
    const html = renderToStaticMarkup(<ExecutiveSummary data={makeData()} />);

    expect(html).toContain('Executive Summary');
    expect(html).toContain('82/100');
    expect(html).toContain('Good usability fundamentals.');
    expect(html).toContain('Top Priorities');
    expect(html).toContain('Fix missing HSTS');
    expect(html).toContain('Add meta descriptions');
  });

  it('renders page and issue stats', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary
        data={makeData({
          pagesAudited: 20,
          totalIssues: 15,
          criticalCount: 3,
          seriousCount: 5,
        })}
      />
    );

    expect(html).toContain('Pages Audited');
    expect(html).toContain('Total Issues');
    expect(html).toContain('Critical');
    expect(html).toContain('Serious');
    expect(html).toContain('20');
    expect(html).toContain('15');
    expect(html).toContain('3');
    expect(html).toContain('5');
  });
});
