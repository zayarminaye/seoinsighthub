import { describe, expect, it } from 'vitest';
import {
  computeReportInsights,
  type ReportIssueInput,
  type ReportPageInput,
} from './reportInsights';

function makePage(): ReportPageInput {
  return {
    id: 'p1',
    url: 'https://example.com',
    httpStatus: 200,
    crawlDepth: 1,
    performanceScore: 85,
    inpValue: 150,
    inpRating: 'GOOD',
    mobileFriendly: true,
    accessibilityScore: 90,
    domNodeCount: 900,
    titleTag: 'Example Title',
    titleLength: 45,
    metaDescription: 'Optimized description',
    metaDescriptionLength: 130,
    h1Count: 1,
    wordCount: 700,
    internalLinksInbound: 4,
    internalLinksOutbound: 8,
    decayBucket: 'HEALTHY',
    eeatScore: 80,
    hasAuthorByline: true,
    hasAuthorPage: true,
    hasSameAs: true,
    details: {},
  };
}

describe('reportInsights non-scoring disclaimer categories', () => {
  it('does not reduce AI citation score for heuristic disclaimer', () => {
    const pages = [makePage()];
    const issues: ReportIssueInput[] = [
      {
        id: 'i1',
        stepNumber: 16,
        severity: 'MINOR',
        category: 'AI Analysis Disclaimer',
        message: 'Heuristic fallback in use',
        recommendation: 'Configure API key',
        url: null,
      },
    ];

    const report = computeReportInsights(pages, issues, {
      uraScoreU: 85,
      uraScoreR: 82,
      uraScoreA: 80,
      uraScoreOverall: 83,
    });

    const aiComponent = report.scoreBreakdown.components.find((c) => c.name === 'AI Citations');
    const aiStep = report.stepInsights.find((s) => s.stepNumber === 16);

    expect(aiComponent?.score).toBe(100);
    expect(aiStep?.status).toBe('good');
    expect(aiStep?.issues.some((i) => i.category === 'AI Analysis Disclaimer')).toBe(true);
  });
});
