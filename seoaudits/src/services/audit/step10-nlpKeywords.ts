import { chromium } from 'playwright';
import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { WORKER_CONFIG } from '../queue/config';

// Common English stop words to exclude from keyword analysis
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'not',
  'no', 'nor', 'this', 'that', 'these', 'those', 'i', 'we', 'you',
  'he', 'she', 'they', 'me', 'us', 'him', 'her', 'them', 'my', 'our',
  'your', 'his', 'its', 'their', 'what', 'which', 'who', 'whom',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'than', 'too',
  'very', 'just', 'about', 'above', 'after', 'again', 'also', 'any',
  'as', 'back', 'because', 'before', 'between', 'down', 'even',
  'first', 'get', 'go', 'here', 'if', 'into', 'know', 'like',
  'make', 'new', 'now', 'only', 'out', 'over', 'said', 'so',
  'still', 'take', 'then', 'there', 'through', 'up', 'use', 'way',
  'well', 'work', 'also', 'one', 'two', 'see', 'time', 'much',
]);

/**
 * Step 10: NLP Keyword & Entity Optimization
 * Analyzes keyword usage, content depth, and keyword placement
 * in title, H1, and body text.
 */
export async function runStep10NlpKeywords(data: StepJobData): Promise<void> {
  const audit = await prisma.auditRun.findUniqueOrThrow({
    where: { id: data.auditRunId },
    select: { seedKeywords: true },
  });

  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      titleTag: true,
      wordCount: true,
    },
  });

  if (pages.length === 0) return;

  const issues: {
    auditRunId: string;
    auditPageId: string;
    stepNumber: number;
    severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
    category: string;
    message: string;
    recommendation: string;
  }[] = [];

  const seedKeywords = audit.seedKeywords.map((k) => k.toLowerCase().trim()).filter(Boolean);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seoaudits.app)',
      viewport: { width: 1920, height: 1080 },
    });

    // Sample up to 20 pages
    const sampled = pages.slice(0, 20);

    for (const pageRecord of sampled) {
      try {
        const page = await context.newPage();
        await page.goto(pageRecord.url, {
          waitUntil: 'domcontentloaded',
          timeout: WORKER_CONFIG.playwright.pageTimeoutMs,
        });

        const content = await page.evaluate(() => {
          const title = document.querySelector('title')?.textContent ?? '';
          const h1 = document.querySelector('h1')?.textContent ?? '';
          const bodyText = document.body?.innerText ?? '';
          return { title, h1, bodyText };
        });

        await page.close();

        const bodyWords = content.bodyText
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 0);
        const wordCount = bodyWords.length;

        // ── Thin content check ────────────────────────────
        if (wordCount < 300) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 10,
            severity: wordCount < 100 ? 'SERIOUS' : 'MODERATE',
            category: 'Thin Content',
            message: `Page has only ${wordCount} words. Pages with fewer than 300 words are considered thin content.`,
            recommendation:
              'Expand the content to at least 300 words with substantive, original information. Thin pages struggle to rank and may be flagged by Google\'s Helpful Content system.',
          });
        }

        // ── Keyword analysis (if seed keywords provided) ──
        if (seedKeywords.length > 0) {
          const titleLower = content.title.toLowerCase();
          const h1Lower = content.h1.toLowerCase();
          const bodyLower = content.bodyText.toLowerCase();

          for (const keyword of seedKeywords) {
            const inTitle = titleLower.includes(keyword);
            const inH1 = h1Lower.includes(keyword);
            const bodyOccurrences = countOccurrences(bodyLower, keyword);
            const density = wordCount > 0 ? (bodyOccurrences / wordCount) * 100 : 0;

            // Keyword not found anywhere
            if (!inTitle && !inH1 && bodyOccurrences === 0) {
              continue; // Not every keyword needs to be on every page
            }

            // Keyword in body but missing from title and H1
            if (bodyOccurrences > 0 && !inTitle && !inH1) {
              issues.push({
                auditRunId: data.auditRunId,
                auditPageId: pageRecord.id,
                stepNumber: 10,
                severity: 'MODERATE',
                category: 'Keyword Placement',
                message: `Keyword "${keyword}" appears in body (${bodyOccurrences}x) but is missing from the title and H1.`,
                recommendation:
                  `Add "${keyword}" to the page title and/or H1 heading. Keywords in title and H1 carry the strongest on-page ranking signal.`,
              });
            }

            // Keyword stuffing check (density > 3%)
            if (density > 3 && bodyOccurrences > 5) {
              issues.push({
                auditRunId: data.auditRunId,
                auditPageId: pageRecord.id,
                stepNumber: 10,
                severity: 'SERIOUS',
                category: 'Keyword Stuffing',
                message: `Keyword "${keyword}" has ${density.toFixed(1)}% density (${bodyOccurrences} occurrences in ${wordCount} words). This exceeds the recommended 1-2%.`,
                recommendation:
                  'Reduce keyword repetition to appear natural. Use synonyms and related terms instead. Google\'s algorithms penalize keyword stuffing.',
              });
            }
          }
        }

        // ── Content depth: top terms analysis ─────────────
        const termCounts = new Map<string, number>();
        for (const word of bodyWords) {
          const cleaned = word.replace(/[^a-z0-9]/g, '');
          if (cleaned.length < 3 || STOP_WORDS.has(cleaned)) continue;
          termCounts.set(cleaned, (termCounts.get(cleaned) ?? 0) + 1);
        }

        // Check if top terms appear in title
        const topTerms = Array.from(termCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        if (topTerms.length > 0 && pageRecord.titleTag) {
          const titleLower = pageRecord.titleTag.toLowerCase();
          const topTermInTitle = topTerms.some(([term]) => titleLower.includes(term));

          if (!topTermInTitle && wordCount > 200) {
            issues.push({
              auditRunId: data.auditRunId,
              auditPageId: pageRecord.id,
              stepNumber: 10,
              severity: 'MINOR',
              category: 'Title-Content Alignment',
              message: `The page's most frequent terms (${topTerms.slice(0, 3).map(([t]) => t).join(', ')}) don't appear in the title tag.`,
              recommendation:
                'Align the title tag with the page\'s primary topic. The title should reflect what the content is about to ensure relevance signals match.',
            });
          }
        }
      } catch (error) {
        console.warn(`NLP analysis failed for ${pageRecord.url}:`, error);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}

function countOccurrences(text: string, keyword: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(keyword, pos)) !== -1) {
    count++;
    pos += keyword.length;
  }
  return count;
}
