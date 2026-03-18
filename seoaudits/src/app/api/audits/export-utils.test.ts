import { describe, expect, it } from 'vitest';
import {
  escapeCsvField,
  extractPsi,
  generateAICitationHistoryCsv,
  generateIssuesCsv,
  generatePagesCsv,
  slugify,
} from './[id]/export/[format]/route';

describe('export csv utilities', () => {
  it('escapes csv fields with commas/quotes/newlines', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField('a\nb')).toBe('"a\nb"');
  });

  it('extracts PSI metrics from page details', () => {
    const metrics = extractPsi({
      psi: { lcpMs: 2100, clsValue: 0.03, tbtMs: 120, fcpMs: 900, siMs: 1400 },
    });
    expect(metrics).toEqual({
      lcpMs: 2100,
      clsValue: 0.03,
      tbtMs: 120,
      fcpMs: 900,
      siMs: 1400,
    });
  });

  it('generates pages csv rows', () => {
    const csv = generatePagesCsv([
      {
        url: 'https://example.com',
        httpStatus: 200,
        crawlDepth: 1,
        performanceScore: 88,
        inpValue: 140,
        inpRating: 'GOOD',
        mobileFriendly: true,
        accessibilityScore: 91,
        domNodeCount: 900,
        titleTag: 'Home',
        titleLength: 4,
        metaDescription: 'A description',
        metaDescriptionLength: 13,
        h1Count: 1,
        wordCount: 420,
        internalLinksInbound: 3,
        internalLinksOutbound: 6,
        contentAge: 12,
        decayBucket: 'HEALTHY',
        eeatScore: 77.2,
        hasAuthorByline: true,
        details: { psi: { lcpMs: 2010, clsValue: 0.02, tbtMs: 100, fcpMs: 850, siMs: 1300 } },
      },
    ]);

    expect(csv).toContain('URL,HTTP Status,Crawl Depth');
    expect(csv).toContain('https://example.com,200,1,88');
    expect(csv).toContain(',2010,0.020,140,GOOD,100,850,1300,Yes,91,');
  });

  it('generates issues csv rows', () => {
    const csv = generateIssuesCsv([
      {
        severity: 'CRITICAL',
        stepNumber: 6,
        category: 'security',
        message: 'Missing HSTS',
        selector: null,
        recommendation: 'Add Strict-Transport-Security header',
        auditPage: { url: 'https://example.com', titleTag: 'Home', httpStatus: 200 },
      },
    ]);

    expect(csv).toContain('Severity,Step,Step Name,Category,Issue,How to Fix');
    expect(csv).toContain('CRITICAL,6,HTTPS & Security,security,Missing HSTS');
    expect(csv).toContain('https://example.com,Home,200');
  });

  it('slugifies domains for filenames', () => {
    expect(slugify('https://example.com/path?x=1')).toBe('example.com-path-x-1');
  });

  it('generates ai citation history csv rows', () => {
    const csv = generateAICitationHistoryCsv([
      {
        auditRunId: 'a1',
        completedAt: '2026-03-18T12:00:00.000Z',
        attemptedQueries: 8,
        successfulQueries: 6,
        failedQueries: 2,
        confidenceScore: 75,
      },
    ]);

    expect(csv).toContain('Audit Run ID,Completed At (UTC),Attempted Queries');
    expect(csv).toContain('a1,2026-03-18T12:00:00.000Z,8,6,2,75');
  });
});
