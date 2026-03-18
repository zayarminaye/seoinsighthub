import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { resolveGeminiApiKeyForUser } from '@/lib/geminiApiKeys';
import { analyzeCitationWithGemini } from './geminiCitationClient';
import { getGeminiMaxQueriesPerAudit } from '@/lib/adminSettings';

type Step16Issue = {
  auditRunId: string;
  auditPageId: string | null;
  stepNumber: number;
  severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
  category: string;
  message: string;
  recommendation: string;
};

function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return trimmed;
  try {
    const url = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '');
  }
}

async function runGeminiCitationAnalysis(opts: {
  auditRunId: string;
  clientDomain: string;
  competitorDomains: string[];
  seedKeywords: string[];
  maxQueries: number;
  apiKey: string;
  issues: Step16Issue[];
}) {
  let queries = await prisma.citationQuery.findMany({
    where: { auditRunId: opts.auditRunId },
    select: {
      id: true,
      queryText: true,
      seedKeyword: true,
    },
  });

  // Auto-bootstrap citation queries for Step 16 audits when user provided seed keywords
  // but did not explicitly trigger the citations route.
  if (queries.length === 0 && opts.seedKeywords.length > 0) {
    const templates = [
      'best {keyword}',
      'how to improve {keyword}',
      '{keyword} checklist',
      '{keyword} examples',
    ];
    const queryRows = opts.seedKeywords.flatMap((seed) =>
      templates.map((t) => ({
        auditRunId: opts.auditRunId,
        seedKeyword: seed,
        queryText: t.replace('{keyword}', seed),
      }))
    );
    await prisma.citationQuery.createMany({
      data: queryRows,
    });

    queries = await prisma.citationQuery.findMany({
      where: { auditRunId: opts.auditRunId },
      select: {
        id: true,
        queryText: true,
        seedKeyword: true,
      },
    });
  }

  if (queries.length === 0) {
    opts.issues.push({
      auditRunId: opts.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'MINOR',
      category: 'AI Citation Data Notice',
      message:
        'No citation query set was found for this audit. Model evidence requires seed keywords to generate AI citation queries.',
      recommendation:
        'Add seed keywords and competitor domains in the audit setup, then run Step 16 again.',
    });
    return;
  }

  const selectedQueries = queries.slice(0, Math.max(1, opts.maxQueries));
  if (selectedQueries.length < queries.length) {
    opts.issues.push({
      auditRunId: opts.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'MINOR',
      category: 'AI Query Budget Applied',
      message: `AI citation analysis was capped at ${selectedQueries.length} queries by admin budget settings.`,
      recommendation:
        'Increase Gemini query budget in Admin settings if you need broader coverage for this audit.',
    });
  }

  await prisma.citationResult.deleteMany({
    where: { citationQuery: { auditRunId: opts.auditRunId } },
  });

  let successCount = 0;
  let clientCitedCount = 0;
  const competitorMentionCounts = new Map<string, number>();
  const callErrors: string[] = [];

  for (const query of selectedQueries) {
    try {
      const result = await analyzeCitationWithGemini({
        apiKey: opts.apiKey,
        queryText: query.queryText,
        seedKeyword: query.seedKeyword,
        clientDomain: opts.clientDomain,
        competitorDomains: opts.competitorDomains,
      });

      successCount++;
      if (result.clientCited) clientCitedCount++;

      for (const competitor of result.competitorsCited) {
        const normalized = normalizeDomain(competitor);
        if (!normalized) continue;
        competitorMentionCounts.set(
          normalized,
          (competitorMentionCounts.get(normalized) ?? 0) + 1
        );
      }

      const created = await prisma.citationResult.create({
        data: {
          citationQueryId: query.id,
          platform: 'GEMINI',
          responseText: result.summary,
          citedDomains: result.citedDomains,
          clientCited: result.clientCited,
          competitorsCited: result.competitorsCited,
          citationContext: result.citationContext,
        },
      });

      if (result.gaps.length > 0) {
        await prisma.citationGap.createMany({
          data: result.gaps.map((gap) => ({
            citationResultId: created.id,
            competitorDomain: normalizeDomain(gap.competitorDomain),
            gapType: gap.gapType,
            priority: gap.priority,
            recommendedAction: gap.recommendedAction,
          })),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown Gemini error';
      callErrors.push(msg);
      console.error('[step16] Gemini citation query failed:', {
        auditRunId: opts.auditRunId,
        query: query.queryText,
        error: msg,
      });
    }
  }

  if (successCount === 0) {
    const quotaLimited = callErrors.some(
      (e) => e.includes('429') || /quota|rate limit/i.test(e)
    );
    opts.issues.push({
      auditRunId: opts.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: quotaLimited ? 'MODERATE' : 'MINOR',
      category: quotaLimited ? 'AI Model Quota Exceeded' : 'AI Model Processing Notice',
      message: quotaLimited
        ? 'Gemini API quota/rate limit was exceeded (HTTP 429), so model-backed citation analysis could not run for this audit.'
        : 'Gemini analysis did not produce usable results, so heuristic citation checks were used for this audit.',
      recommendation: quotaLimited
        ? 'Reduce query volume (fewer seed keywords), wait for quota reset, or upgrade Gemini API quota/billing before rerunning Step 16.'
        : 'Verify your Gemini key and retry citation analysis. If the issue persists, reduce query volume and try again.',
    });
    if (callErrors.length > 0) {
      console.warn('[step16] Gemini failures:', callErrors.slice(0, 3));
    }
    return;
  }

  const clientCitationRate = successCount > 0 ? clientCitedCount / successCount : 0;
  if (clientCitationRate === 0) {
    opts.issues.push({
      auditRunId: opts.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'SERIOUS',
      category: 'AI Citation Gap',
      message: `Your domain was not cited in ${successCount}/${successCount} Gemini responses across sampled queries.`,
      recommendation:
        'Publish answer-first pages for target intents, add stronger entity signals, and build authoritative references for competitive topics.',
    });
  } else if (clientCitationRate < 0.25) {
    opts.issues.push({
      auditRunId: opts.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'MODERATE',
      category: 'Low AI Citation Visibility',
      message: `Your domain appeared in only ${Math.round(clientCitationRate * 100)}% of Gemini responses (${clientCitedCount}/${successCount}).`,
      recommendation:
        'Prioritize content refresh on high-intent pages, strengthen topical clusters, and improve schema + source attribution for citable passages.',
    });
  }

  const topCompetitor = [...competitorMentionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCompetitor && topCompetitor[1] >= Math.max(2, Math.ceil(successCount * 0.4))) {
    opts.issues.push({
      auditRunId: opts.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'MODERATE',
      category: 'Competitor Citation Advantage',
      message: `${topCompetitor[0]} appeared in ${topCompetitor[1]} Gemini responses, significantly above your domain.`,
      recommendation:
        `Benchmark ${topCompetitor[0]} citation-winning pages and replicate stronger factual depth, clearer headings, and source-backed sections.`,
    });
  }
}

/**
 * Step 16: AI Citation Gap Analysis
 *
 * Analyzes how well the site is optimized for AI search citation.
 * Checks for content patterns that AI systems (Gemini, Perplexity, ChatGPT)
 * tend to cite:
 * - Clear, factual, well-structured content
 * - FAQ and Q&A format content
 * - Definitions, statistics, and data-driven claims
 * - Proper attribution and source credibility signals
 * - AI bot crawl access (from step 1 robots.txt analysis)
 */
export async function runStep16AiCitations(data: StepJobData): Promise<void> {
  await prisma.auditIssue.deleteMany({
    where: { auditRunId: data.auditRunId, stepNumber: 16 },
  });

  const [auditRun, maxQueries] = await Promise.all([
    prisma.auditRun.findUnique({
      where: { id: data.auditRunId },
      select: {
        userId: true,
        targetDomain: true,
        competitorDomains: true,
        seedKeywords: true,
      },
    }),
    getGeminiMaxQueriesPerAudit(),
  ]);

  const resolvedKey = auditRun
    ? await resolveGeminiApiKeyForUser(auditRun.userId)
    : { apiKey: null, source: 'none' as const };

  const issues: Step16Issue[] = [];

  if (resolvedKey.source === 'none') {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'MINOR',
      category: 'AI Analysis Disclaimer',
      message:
        'AI citation analysis ran in heuristic mode because no Gemini API key is configured for your account or admin fallback settings.',
      recommendation:
        'Add your Gemini API key in Settings, or ask an admin to configure a fallback key in Admin > Features.',
    });
  } else if (auditRun?.targetDomain && resolvedKey.apiKey) {
    await runGeminiCitationAnalysis({
      auditRunId: data.auditRunId,
      clientDomain: auditRun.targetDomain,
      competitorDomains: (auditRun.competitorDomains ?? []).map((d) => normalizeDomain(d)).filter(Boolean),
      seedKeywords: (auditRun.seedKeywords ?? []).map((k) => k.trim()).filter(Boolean),
      maxQueries,
      apiKey: resolvedKey.apiKey,
      issues,
    });
  }

  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      wordCount: true,
      h1Count: true,
      titleTag: true,
      details: true,
    },
  });

  // Step 16 can still produce model-backed citation evidence without crawl pages.
  // Page-level/site-structure heuristic checks below require crawl data.
  if (pages.length === 0) {
    if (issues.length > 0) {
      await prisma.auditIssue.createMany({ data: issues });
    }
    return;
  }

  // Check robots.txt AI bot directives (from step 1 crawl details)
  // Find the homepage page for robots.txt data
  const homePage = pages.find((p) => {
    try {
      const u = new URL(p.url);
      return u.pathname === '/' || u.pathname === '';
    } catch {
      return false;
    }
  });

  const homeDetails = homePage?.details as Record<string, unknown> | null;
  const robotsTxt = homeDetails?.robotsTxt as {
    aiBotDirectives?: Record<string, string[]>;
  } | null;
  const aiBotDirectives = robotsTxt?.aiBotDirectives ?? {};

  // ── AI Bot Access ──
  const blockedBots: string[] = [];
  const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'CCBot', 'Google-Extended', 'anthropic-ai', 'ClaudeBot'];

  for (const bot of AI_BOTS) {
    const directives = aiBotDirectives[bot] ?? [];
    if (directives.some((d) => d === '/' || d === '/*')) {
      blockedBots.push(bot);
    }
  }

  if (blockedBots.length > 0) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: blockedBots.length >= 3 ? 'SERIOUS' : 'MODERATE',
      category: 'AI Bot Blocked',
      message: `${blockedBots.length} AI crawler(s) blocked in robots.txt: ${blockedBots.join(', ')}. This prevents AI search engines from indexing your content.`,
      recommendation:
        'Review your robots.txt AI bot directives. Blocking AI crawlers means your content won\'t appear in AI-powered search results (Google AI Overview, Perplexity, ChatGPT browsing).',
    });
  }

  if (blockedBots.length === 0 && AI_BOTS.length > 0 && Object.keys(aiBotDirectives).length === 0) {
    // No explicit AI bot rules — this is fine, they inherit default rules
  }

  // ── Content Structure Analysis for AI Citation ──
  let pagesWithFaqSchema = 0;
  let pagesWithLists = 0;
  let thinContentPages = 0;

  for (const page of pages) {
    const details = page.details as Record<string, unknown> | null;
    const schemas = (details?.schemas as string[]) ?? [];
    const wordCount = page.wordCount ?? 0;

    // Check for FAQ/HowTo structured data (highly cited by AI)
    if (schemas.some((s) => s.toLowerCase().includes('faq'))) {
      pagesWithFaqSchema++;
    }
    // Check for structured content patterns (from details)
    const hasLists = (details?.listCount as number) ?? 0;
    if (hasLists > 0) pagesWithLists++;

    // Thin content is less citable
    if (wordCount < 300 && wordCount > 0) {
      thinContentPages++;
    }
  }

  // ── Site-level: No FAQ schema ──
  if (pagesWithFaqSchema === 0 && pages.length > 3) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'MODERATE',
      category: 'Missing FAQ Schema',
      message:
        'No FAQ structured data found. FAQ content is frequently cited by AI search systems because it provides clear question-answer pairs.',
      recommendation:
        'Add FAQ sections to key landing pages with FAQPage schema markup. AI systems like Perplexity and Google AI Overview prioritize structured Q&A content.',
    });
  }

  // ── Site-level: High thin content ratio ──
  if (thinContentPages > 0 && pages.length > 3) {
    const thinPct = Math.round((thinContentPages / pages.length) * 100);
    if (thinPct >= 40) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 16,
        severity: 'SERIOUS',
        category: 'Low Citation Potential',
        message: `${thinPct}% of pages (${thinContentPages}/${pages.length}) have fewer than 300 words. Thin content is rarely cited by AI systems.`,
        recommendation:
          'Expand thin pages with comprehensive, factual content. AI systems cite pages that provide thorough answers — aim for 500+ words with clear structure (headings, lists, definitions).',
      });
    }
  }

  // ── Site-level: No structured content (lists, definitions) ──
  if (pagesWithLists === 0 && pages.length > 5) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 16,
      severity: 'MINOR',
      category: 'Unstructured Content',
      message:
        'No pages contain structured lists. AI systems prefer content with clear formatting — bullet points, numbered lists, and step-by-step instructions.',
      recommendation:
        'Break complex information into bulleted or numbered lists. Use H2/H3 headings to create scannable sections that AI can extract as citations.',
    });
  }

  // ── Per-page: Content that could be more citable ──
  for (const page of pages) {
    const wordCount = page.wordCount ?? 0;
    const h1Count = page.h1Count ?? 0;
    const details = page.details as Record<string, unknown> | null;
    const headingCount = (details?.headingCount as number) ?? 0;

    // Long content with no structure is hard for AI to cite
    if (wordCount > 800 && headingCount <= 1 && h1Count <= 1) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 16,
        severity: 'MINOR',
        category: 'Poor Content Structure',
        message: `Page has ${wordCount} words but minimal heading structure. Long-form content without clear sections is harder for AI to parse and cite.`,
        recommendation:
          'Break content into sections with descriptive H2/H3 headings. Each section should answer a specific question or cover a distinct subtopic.',
      });
    }
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
