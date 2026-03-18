import { chromium } from 'playwright';
import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { WORKER_CONFIG } from '../queue/config';

interface SchemaResult {
  types: string[];
  hasSameAs: boolean;
  sameAsUrls: string[];
  hasOrganization: boolean;
  hasBreadcrumb: boolean;
  hasArticle: boolean;
  hasFAQ: boolean;
  hasProduct: boolean;
  hasLocalBusiness: boolean;
  rawSchemas: Record<string, unknown>[];
}

/**
 * Step 13: Structured Data & Schema Markup
 * Detects JSON-LD structured data, validates schema types,
 * checks for sameAs social profiles and common rich result schemas.
 */
export async function runStep13Schema(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: { id: true, url: true },
  });

  if (pages.length === 0) return;

  const issues: {
    auditRunId: string;
    auditPageId: string | null;
    stepNumber: number;
    severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
    category: string;
    message: string;
    recommendation: string;
  }[] = [];

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seoaudits.app)',
    });

    // Sample pages (up to 15)
    const sampled = pages.slice(0, 15);
    let siteHasOrg = false;
    let siteHasBreadcrumb = false;

    for (const pageRecord of sampled) {
      try {
        const page = await context.newPage();
        await page.goto(pageRecord.url, {
          waitUntil: 'domcontentloaded',
          timeout: WORKER_CONFIG.playwright.pageTimeoutMs,
        });

        const schemaResult = await page.evaluate((): SchemaResult => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          const types: string[] = [];
          const sameAsUrls: string[] = [];
          let hasOrganization = false;
          let hasBreadcrumb = false;
          let hasArticle = false;
          let hasFAQ = false;
          let hasProduct = false;
          let hasLocalBusiness = false;
          const rawSchemas: Record<string, unknown>[] = [];

          scripts.forEach((script) => {
            try {
              const json = JSON.parse(script.textContent ?? '');
              const items = Array.isArray(json) ? json : [json];

              for (const item of items) {
                const type = item['@type'];
                if (type) {
                  const typeArr = Array.isArray(type) ? type : [type];
                  types.push(...typeArr);

                  for (const t of typeArr) {
                    const tLower = String(t).toLowerCase();
                    if (tLower === 'organization') hasOrganization = true;
                    if (tLower === 'breadcrumblist') hasBreadcrumb = true;
                    if (tLower.includes('article') || tLower === 'newsarticle' || tLower === 'blogposting') hasArticle = true;
                    if (tLower === 'faqpage') hasFAQ = true;
                    if (tLower === 'product') hasProduct = true;
                    if (tLower === 'localbusiness' || tLower.includes('business')) hasLocalBusiness = true;
                  }
                }

                // Extract sameAs
                if (item.sameAs) {
                  const sameAs = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
                  sameAsUrls.push(...sameAs.filter((u: unknown) => typeof u === 'string'));
                }

                rawSchemas.push(item);
              }
            } catch {
              // Invalid JSON-LD, skip
            }
          });

          return {
            types,
            hasSameAs: sameAsUrls.length > 0,
            sameAsUrls,
            hasOrganization,
            hasBreadcrumb,
            hasArticle,
            hasFAQ,
            hasProduct,
            hasLocalBusiness,
            rawSchemas,
          };
        });

        await page.close();

        // Track site-level flags
        if (schemaResult.hasOrganization) siteHasOrg = true;
        if (schemaResult.hasBreadcrumb) siteHasBreadcrumb = true;

        // Update page record
        await prisma.auditPage.update({
          where: { id: pageRecord.id },
          data: {
            hasSameAs: schemaResult.hasSameAs,
            sameAsUrls: schemaResult.sameAsUrls.length > 0 ? schemaResult.sameAsUrls : undefined,
          },
        });

        // ── No structured data at all ─────────────────────
        if (schemaResult.types.length === 0) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 13,
            severity: 'MODERATE',
            category: 'Missing Schema',
            message: 'Page has no JSON-LD structured data. Structured data enables rich results in Google search.',
            recommendation:
              'Add JSON-LD structured data matching the page type: Article for blog posts, Product for product pages, FAQPage for FAQ sections, BreadcrumbList for navigation. Use Google\'s Structured Data Markup Helper to generate the code.',
          });
        }

        // ── Missing breadcrumb (on non-homepage) ──────────
        if (!schemaResult.hasBreadcrumb && !isHomepage(pageRecord.url)) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: pageRecord.id,
            stepNumber: 13,
            severity: 'MINOR',
            category: 'Breadcrumb Schema',
            message: 'Page is missing BreadcrumbList schema. Breadcrumbs enhance search result display and site navigation.',
            recommendation:
              'Add BreadcrumbList JSON-LD to all non-homepage pages. Breadcrumb rich results show the page path in Google search, improving click-through rates.',
          });
        }
      } catch (error) {
        console.warn(`Schema check failed for ${pageRecord.url}:`, error);
      }
    }

    await context.close();

    // ── Site-level: no Organization schema ─────────────────
    if (!siteHasOrg) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 13,
        severity: 'SERIOUS',
        category: 'Organization Schema',
        message: 'No Organization schema found on any sampled page. This is essential for Knowledge Panel eligibility and brand identity.',
        recommendation:
          'Add Organization JSON-LD to the homepage with: name, url, logo, sameAs (social profile links), contactPoint, and description. This helps Google build your Knowledge Panel.',
      });
    }

    // ── Site-level: no breadcrumbs anywhere ────────────────
    if (!siteHasBreadcrumb && pages.length > 3) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 13,
        severity: 'MODERATE',
        category: 'Breadcrumb Schema',
        message: 'No BreadcrumbList schema found on any page. Breadcrumbs are displayed in Google search results.',
        recommendation:
          'Implement BreadcrumbList schema site-wide. This is one of the easiest rich results to earn and improves click-through rates by showing URL hierarchy in search.',
      });
    }
  } finally {
    await browser.close();
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}

function isHomepage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/' || parsed.pathname === '';
  } catch {
    return false;
  }
}
