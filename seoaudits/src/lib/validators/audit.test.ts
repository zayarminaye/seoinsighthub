import { describe, expect, it } from 'vitest';
import { CreateAuditSchema, ExportFormatSchema } from './audit';

describe('CreateAuditSchema', () => {
  it('accepts a valid public url', () => {
    const parsed = CreateAuditSchema.parse({
      domain: 'https://example.com',
      maxPages: 25,
      selectedSteps: [1, 2, 3],
    });

    expect(parsed.domain).toBe('https://example.com');
    expect(parsed.maxPages).toBe(25);
  });

  it('rejects localhost target', () => {
    expect(() =>
      CreateAuditSchema.parse({
        domain: 'http://localhost:3000',
      })
    ).toThrowError();
  });
});

describe('ExportFormatSchema', () => {
  it('supports expected formats', () => {
    expect(ExportFormatSchema.parse({ format: 'pdf' }).format).toBe('pdf');
    expect(ExportFormatSchema.parse({ format: 'pages-csv' }).format).toBe(
      'pages-csv'
    );
    expect(ExportFormatSchema.parse({ format: 'issues-csv' }).format).toBe(
      'issues-csv'
    );
    expect(ExportFormatSchema.parse({ format: 'ai-citations-csv' }).format).toBe(
      'ai-citations-csv'
    );
    expect(ExportFormatSchema.parse({ format: 'ai-citations-history-csv' }).format).toBe(
      'ai-citations-history-csv'
    );
    expect(ExportFormatSchema.parse({ format: 'json' }).format).toBe('json');
  });

  it('rejects unsupported format', () => {
    expect(() => ExportFormatSchema.parse({ format: 'xlsx' })).toThrowError();
  });
});
