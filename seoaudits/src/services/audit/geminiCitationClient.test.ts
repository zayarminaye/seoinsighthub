import { describe, expect, it } from 'vitest';
import { __testables } from './geminiCitationClient';

describe('geminiCitationClient helpers', () => {
  it('extracts JSON from fenced code blocks', () => {
    const input = [
      '```json',
      '{"summary":"ok","citationContext":"ctx","citedDomains":["www.Example.com"],"competitorsCited":["https://Comp.com"],"clientCited":true,"gaps":[]}',
      '```',
    ].join('\n');

    const json = __testables.extractJsonPayload(input);
    expect(json.startsWith('{')).toBe(true);
  });

  it('parses and normalizes Gemini JSON response', () => {
    const parsed = __testables.parseGeminiOutputText(
      JSON.stringify({
        summary: 'Client appears in some responses',
        citationContext: 'High-intent comparison query',
        citedDomains: ['https://www.Client.com', 'competitor.com'],
        competitorsCited: ['www.Competitor.com'],
        clientCited: true,
        gaps: [
          {
            competitorDomain: 'HTTPS://WWW.Competitor.com',
            gapType: 'CITATION_GAP',
            priority: 80,
            recommendedAction: 'Add comparison content',
          },
        ],
      })
    );

    expect(parsed.citedDomains).toContain('client.com');
    expect(parsed.competitorsCited).toEqual(['competitor.com']);
    expect(parsed.gaps[0]?.competitorDomain).toBe('competitor.com');
  });
});
