import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

// Industry-standard title/meta description length ranges
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_DESC_MIN = 120;
const META_DESC_MAX = 160;

/**
 * Step 8: Title Tag & Meta Description
 * Analyzes title tags and meta descriptions for SEO best practices.
 * Data was already collected during Step 1 crawl — this step creates issues.
 */
export async function runStep08TitleMeta(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      titleTag: true,
      titleLength: true,
      metaDescription: true,
      metaDescriptionLength: true,
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

  // Track titles for duplicate detection
  const titleMap = new Map<string, string[]>();

  for (const page of pages) {
    // ── Title Tag ──────────────────────────────────────────
    if (!page.titleTag || page.titleTag.trim().length === 0) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 8,
        severity: 'CRITICAL',
        category: 'Title Tag',
        message: 'Page is missing a title tag.',
        recommendation:
          'Add a unique, descriptive <title> tag (30-60 characters) that includes your primary keyword for this page.',
      });
    } else {
      const titleLen = page.titleLength ?? page.titleTag.length;

      // Track for duplicate check
      const normalized = page.titleTag.trim().toLowerCase();
      if (!titleMap.has(normalized)) {
        titleMap.set(normalized, []);
      }
      titleMap.get(normalized)!.push(page.url);

      if (titleLen < TITLE_MIN) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 8,
          severity: 'MODERATE',
          category: 'Title Tag',
          message: `Title is too short (${titleLen} chars). Recommended: ${TITLE_MIN}-${TITLE_MAX} characters.`,
          recommendation:
            'Expand the title to include your primary keyword and a compelling value proposition. Aim for 30-60 characters to maximize SERP visibility.',
        });
      } else if (titleLen > TITLE_MAX) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 8,
          severity: 'MINOR',
          category: 'Title Tag',
          message: `Title is too long (${titleLen} chars). Google truncates after ~${TITLE_MAX} characters in SERPs.`,
          recommendation:
            'Shorten the title to 60 characters or fewer. Front-load the primary keyword so it remains visible even if truncated.',
        });
      }

      // Check for generic/boilerplate titles
      const genericPatterns = [
        /^home$/i,
        /^untitled/i,
        /^page \d+/i,
        /^welcome/i,
        /^test/i,
      ];
      if (genericPatterns.some((p) => p.test(page.titleTag!.trim()))) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 8,
          severity: 'SERIOUS',
          category: 'Title Tag',
          message: `Title appears generic or boilerplate: "${page.titleTag!.trim()}".`,
          recommendation:
            'Replace with a unique, keyword-rich title that describes the page content and entices clicks from search results.',
        });
      }
    }

    // ── Meta Description ──────────────────────────────────
    if (!page.metaDescription || page.metaDescription.trim().length === 0) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: page.id,
        stepNumber: 8,
        severity: 'SERIOUS',
        category: 'Meta Description',
        message: 'Page is missing a meta description.',
        recommendation:
          'Add a compelling meta description (120-160 characters) that summarizes the page content and includes a call-to-action. Google uses this as the snippet in search results.',
      });
    } else {
      const descLen = page.metaDescriptionLength ?? page.metaDescription.length;

      if (descLen < META_DESC_MIN) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 8,
          severity: 'MODERATE',
          category: 'Meta Description',
          message: `Meta description is too short (${descLen} chars). Recommended: ${META_DESC_MIN}-${META_DESC_MAX} characters.`,
          recommendation:
            'Expand the meta description to fully utilize the SERP snippet space. Include the primary keyword naturally and a compelling reason to click.',
        });
      } else if (descLen > META_DESC_MAX) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 8,
          severity: 'MINOR',
          category: 'Meta Description',
          message: `Meta description is too long (${descLen} chars). Google truncates after ~${META_DESC_MAX} characters.`,
          recommendation:
            'Shorten to 160 characters. Put the most important information and keywords first so they remain visible in search results.',
        });
      }
    }
  }

  // ── Duplicate title detection ─────────────────────────────
  for (const [title, urls] of titleMap) {
    if (urls.length > 1) {
      // Create one site-level issue for the duplicate group
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: pages.find((p) => p.url === urls[0])?.id ?? pages[0]!.id,
        stepNumber: 8,
        severity: 'SERIOUS',
        category: 'Duplicate Title',
        message: `${urls.length} pages share the same title: "${title.length > 60 ? title.slice(0, 57) + '...' : title}".`,
        recommendation:
          'Each page should have a unique title tag. Duplicate titles signal to Google that pages may be duplicate content, diluting ranking potential.',
      });
    }
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
