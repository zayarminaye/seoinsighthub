import { z } from 'zod';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 20_000;
const GEMINI_MAX_RETRIES = 2;

const GeminiGapSchema = z.object({
  competitorDomain: z.string().trim().min(1),
  gapType: z.enum(['CITATION_GAP', 'LOW_VISIBILITY', 'NOT_CITED']),
  priority: z.number().int().min(1).max(100),
  recommendedAction: z.string().trim().min(1).max(500),
});

const GeminiCitationSchema = z.object({
  summary: z.string().trim().min(1).max(2_000),
  citationContext: z.string().trim().min(1).max(2_000),
  citedDomains: z.array(z.string().trim().min(1)).max(30),
  competitorsCited: z.array(z.string().trim().min(1)).max(30),
  clientCited: z.boolean(),
  gaps: z.array(GeminiGapSchema).max(20),
});

export type GeminiCitationAnalysis = z.infer<typeof GeminiCitationSchema>;

interface AnalyzeInput {
  apiKey: string;
  queryText: string;
  seedKeyword: string;
  clientDomain: string;
  competitorDomains: string[];
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return trimmed;
  try {
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '');
  }
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty Gemini response payload.');

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function parseGeminiOutputText(text: string): GeminiCitationAnalysis {
  const jsonText = extractJsonPayload(text);
  const parsed = JSON.parse(jsonText) as unknown;
  const normalized = GeminiCitationSchema.parse(parsed);

  return {
    ...normalized,
    citedDomains: [...new Set(normalized.citedDomains.map(normalizeDomain).filter(Boolean))],
    competitorsCited: [...new Set(normalized.competitorsCited.map(normalizeDomain).filter(Boolean))],
    gaps: normalized.gaps.map((gap) => ({
      ...gap,
      competitorDomain: normalizeDomain(gap.competitorDomain),
      recommendedAction: gap.recommendedAction.trim(),
    })),
  };
}

function buildPrompt(input: AnalyzeInput): string {
  return [
    'You are an SEO analyst focused on AI citation visibility.',
    'Analyze this search query and estimate citation visibility in AI-generated answers.',
    '',
    `Query: ${input.queryText}`,
    `Seed keyword: ${input.seedKeyword}`,
    `Client domain: ${normalizeDomain(input.clientDomain)}`,
    `Competitor domains: ${input.competitorDomains.map(normalizeDomain).join(', ') || 'None'}`,
    '',
    'Output strict JSON only with this schema:',
    '{',
    '  "summary": string,',
    '  "citationContext": string,',
    '  "citedDomains": string[],',
    '  "competitorsCited": string[],',
    '  "clientCited": boolean,',
    '  "gaps": [',
    '    {',
    '      "competitorDomain": string,',
    '      "gapType": "CITATION_GAP" | "LOW_VISIBILITY" | "NOT_CITED",',
    '      "priority": number (1-100),',
    '      "recommendedAction": string',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Use only domains in host format (example.com).',
    '- Include only meaningful, actionable gaps.',
    '- Keep recommendations concrete and SEO-implementable.',
  ].join('\n');
}

async function callGeminiApi(apiKey: string, prompt: string): Promise<string> {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
    }

    const body = (await res.json()) as GeminiGenerateContentResponse;
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n').trim();
    if (!text) {
      throw new Error('Gemini API returned empty content.');
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry<T>(operation: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Operation failed');
}

export async function analyzeCitationWithGemini(input: AnalyzeInput): Promise<GeminiCitationAnalysis> {
  const prompt = buildPrompt(input);
  const text = await withRetry(() => callGeminiApi(input.apiKey, prompt), GEMINI_MAX_RETRIES);
  return parseGeminiOutputText(text);
}

export const __testables = {
  normalizeDomain,
  parseGeminiOutputText,
  extractJsonPayload,
};
