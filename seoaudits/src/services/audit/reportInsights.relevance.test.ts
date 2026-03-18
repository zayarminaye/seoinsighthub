import { describe, expect, it } from 'vitest';
import {
  computeReportInsights,
  type ReportIssueInput,
  type ReportPageInput,
} from './reportInsights';

function makePage(overrides: Partial<ReportPageInput> = {}): ReportPageInput {
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
    metaDescription: 'This is an optimized meta description for SEO performance.',
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
    details: { psi: { lcpMs: 1800, clsValue: 0.03 } },
    ...overrides,
  };
}

function getStep(result: ReturnType<typeof computeReportInsights>, stepNumber: number) {
  const step = result.stepInsights.find((s) => s.stepNumber === stepNumber);
  if (!step) throw new Error(`Missing step ${stepNumber}`);
  return step;
}

describe('reportInsights relevance steps (8-14)', () => {
  it('marks relevance steps healthy when page signals are strong', () => {
    const pages: ReportPageInput[] = [
      makePage({ id: 'p1', url: 'https://example.com/a' }),
      makePage({ id: 'p2', url: 'https://example.com/b', titleTag: 'Another Strong Title', titleLength: 40 }),
    ];
    const issues: ReportIssueInput[] = [
      {
        id: 'i8',
        stepNumber: 8,
        severity: 'MINOR',
        category: 'Title Tag',
        message: 'Minor title refinement suggestion',
        recommendation: 'Optional',
        url: 'https://example.com/a',
      },
      {
        id: 'i11',
        stepNumber: 11,
        severity: 'MINOR',
        category: 'Link Distribution',
        message: 'Minor internal link balancing suggestion',
        recommendation: 'Optional',
        url: 'https://example.com/b',
      },
    ];

    const report = computeReportInsights(pages, issues, {
      uraScoreU: 82,
      uraScoreR: 88,
      uraScoreA: 75,
      uraScoreOverall: 84,
    });

    expect(getStep(report, 8).status).toBe('good');
    expect(getStep(report, 11).status).toBe('good');
    expect(report.stepInsights.some((s) => s.stepNumber === 13)).toBe(false);
    expect(report.stepInsights.some((s) => s.stepNumber === 14)).toBe(false);
  });

  it('degrades relevance step status when issues are present', () => {
    const pages: ReportPageInput[] = [
      makePage({
        titleTag: null,
        titleLength: null,
        metaDescription: null,
        metaDescriptionLength: null,
        h1Count: 0,
        wordCount: 120,
        internalLinksInbound: 0,
      }),
    ];
    const issues: ReportIssueInput[] = [
      {
        id: 'i1',
        stepNumber: 8,
        severity: 'SERIOUS',
        category: 'Title Tag',
        message: 'Missing title tag',
        recommendation: 'Add unique title',
        url: 'https://example.com',
      },
      {
        id: 'i2',
        stepNumber: 10,
        severity: 'MODERATE',
        category: 'Thin Content',
        message: 'Page has under 300 words',
        recommendation: 'Expand content depth',
        url: 'https://example.com',
      },
      {
        id: 'i3',
        stepNumber: 11,
        severity: 'SERIOUS',
        category: 'Orphan Page',
        message: 'No internal links',
        recommendation: 'Add contextual links',
        url: 'https://example.com',
      },
    ];

    const report = computeReportInsights(pages, issues, {
      uraScoreU: 55,
      uraScoreR: 40,
      uraScoreA: 50,
      uraScoreOverall: 48,
    });

    expect(getStep(report, 8).status).toBe('poor');
    expect(getStep(report, 10).status).toBe('poor');
    expect(getStep(report, 11).status).toBe('poor');
    expect(getStep(report, 8).issues).toHaveLength(1);
    expect(getStep(report, 10).issues).toHaveLength(1);
    expect(getStep(report, 11).issues).toHaveLength(1);
  });

  it('respects selectedSteps filter for step insights', () => {
    const pages: ReportPageInput[] = [makePage()];
    const issues: ReportIssueInput[] = [
      {
        id: 'i-auth',
        stepNumber: 15,
        severity: 'SERIOUS',
        category: 'Missing Social Profiles',
        message: 'Missing social profiles in schema',
        recommendation: 'Add sameAs links',
        url: 'https://example.com',
      },
      {
        id: 'i-rel',
        stepNumber: 8,
        severity: 'MODERATE',
        category: 'Title Tag',
        message: 'Title too short',
        recommendation: 'Expand title',
        url: 'https://example.com',
      },
    ];

    const report = computeReportInsights(
      pages,
      issues,
      {
        uraScoreU: 82,
        uraScoreR: 88,
        uraScoreA: 75,
        uraScoreOverall: 84,
      },
      {
        selectedSteps: [1, 2, 3, 4, 5, 6, 7, 8],
      }
    );

    expect(report.stepInsights.some((s) => s.stepNumber === 8)).toBe(true);
    expect(report.stepInsights.some((s) => s.stepNumber === 15)).toBe(false);
  });
});
