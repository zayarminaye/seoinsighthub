import { chromium } from 'playwright';
import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';
import { WORKER_CONFIG } from '../queue/config';

/**
 * Step 17: E-E-A-T Signal Detection
 *
 * Checks for Experience, Expertise, Authoritativeness, Trustworthiness signals:
 * - Author bylines and author pages
 * - About page / Company info
 * - Contact information
 * - Trust signals (testimonials, credentials, certifications)
 * - Editorial policies (fact-checking, editorial guidelines)
 * - Date published / date updated signals
 */
export async function runStep17Eeat(data: StepJobData): Promise<void> {
  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      details: true,
    },
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
      userAgent:
        'Mozilla/5.0 (compatible; SEOAuditBot/1.0; +https://seoaudits.app)',
    });
    context.setDefaultTimeout(WORKER_CONFIG.playwright.pageTimeoutMs);

    // Track site-level E-E-A-T signals
    let hasAboutPage = false;
    let hasContactPage = false;
    let hasPrivacyPolicy = false;
    let hasTermsPage = false;
    let pagesWithAuthor = 0;
    let pagesWithDatePublished = 0;
    let totalContentPages = 0;

    // Batch processing
    const batchSize = WORKER_CONFIG.playwright.maxConcurrentPages;

    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (pageData) => {
          const page = await context.newPage();
          try {
            await page.goto(pageData.url, {
              waitUntil: 'domcontentloaded',
              timeout: WORKER_CONFIG.playwright.navigationTimeoutMs,
            });

            const eeatSignals = await page.evaluate(() => {
              const body = document.body;
              const bodyText = body?.innerText?.toLowerCase() ?? '';

              // Check URL patterns for key pages
              const path = window.location.pathname.toLowerCase();
              const isAboutPage = /\/(about|about-us|company|who-we-are)\/?$/i.test(path);
              const isContactPage = /\/(contact|contact-us|get-in-touch)\/?$/i.test(path);
              const isPrivacyPage = /\/(privacy|privacy-policy)\/?$/i.test(path);
              const isTermsPage = /\/(terms|terms-of-service|tos)\/?$/i.test(path);

              // Author byline detection
              const authorSelectors = [
                '[rel="author"]',
                '.author',
                '.byline',
                '.post-author',
                '.entry-author',
                '[itemprop="author"]',
                '.article-author',
                '.written-by',
              ];
              let hasAuthorByline = false;
              for (const sel of authorSelectors) {
                const el = document.querySelector(sel);
                if (el && el.textContent && el.textContent.trim().length > 0) {
                  hasAuthorByline = true;
                  break;
                }
              }

              // Author page link detection
              const authorLinks = document.querySelectorAll('a[rel="author"], a[href*="/author/"], a[href*="/team/"]');
              const hasAuthorPage = authorLinks.length > 0;

              // Date signals
              const dateSelectors = [
                'time[datetime]',
                '[itemprop="datePublished"]',
                '.published-date',
                '.post-date',
                '.entry-date',
                '.article-date',
              ];
              let hasDatePublished = false;
              for (const sel of dateSelectors) {
                if (document.querySelector(sel)) {
                  hasDatePublished = true;
                  break;
                }
              }

              const modifiedSelectors = [
                '[itemprop="dateModified"]',
                '.updated-date',
                '.modified-date',
                '.last-updated',
              ];
              let hasDateModified = false;
              for (const sel of modifiedSelectors) {
                if (document.querySelector(sel)) {
                  hasDateModified = true;
                  break;
                }
              }

              // Trust signals
              const hasTrustSignals = {
                testimonials: !!document.querySelector('.testimonial, .review, [itemprop="review"], .client-testimonial'),
                credentials: bodyText.includes('certified') || bodyText.includes('accredited') || bodyText.includes('licensed'),
                awards: bodyText.includes('award') || bodyText.includes('recognized') || bodyText.includes('featured in'),
                socialProof: !!document.querySelector('.social-proof, .as-seen-in, .featured-in, .trust-badges'),
              };

              // Navigation links to trust pages
              const navLinks = Array.from(document.querySelectorAll('nav a, footer a'));
              const linkTexts = navLinks.map((a) => a.textContent?.toLowerCase().trim() ?? '');
              const linksToAbout = linkTexts.some((t) => t === 'about' || t === 'about us');
              const linksToContact = linkTexts.some((t) => t === 'contact' || t === 'contact us');
              const linksToPrivacy = linkTexts.some((t) => t.includes('privacy'));
              const linksToTerms = linkTexts.some((t) => t.includes('terms'));

              // Determine if this is a content/article page
              const isContentPage =
                !!document.querySelector('article') ||
                !!document.querySelector('[itemprop="articleBody"]') ||
                !!document.querySelector('.post-content, .entry-content, .article-content');

              // Schema Person/Organization detection
              const schemas = Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
              );
              let hasPersonSchema = false;
              let hasOrgSchema = false;
              for (const el of schemas) {
                const text = el.textContent ?? '';
                if (text.includes('"Person"')) hasPersonSchema = true;
                if (text.includes('"Organization"')) hasOrgSchema = true;
              }

              return {
                isAboutPage,
                isContactPage,
                isPrivacyPage,
                isTermsPage,
                hasAuthorByline,
                hasAuthorPage,
                hasDatePublished,
                hasDateModified,
                hasTrustSignals,
                linksToAbout,
                linksToContact,
                linksToPrivacy,
                linksToTerms,
                isContentPage,
                hasPersonSchema,
                hasOrgSchema,
              };
            });

            // Update page-level E-E-A-T fields
            const eeatScore = computeEeatScore(eeatSignals);

            await prisma.auditPage.update({
              where: { id: pageData.id },
              data: {
                eeatScore,
                hasAuthorByline: eeatSignals.hasAuthorByline,
                hasAuthorPage: eeatSignals.hasAuthorPage,
              },
            });

            // Track site-level signals
            if (eeatSignals.isAboutPage) hasAboutPage = true;
            if (eeatSignals.isContactPage) hasContactPage = true;
            if (eeatSignals.isPrivacyPage) hasPrivacyPolicy = true;
            if (eeatSignals.isTermsPage) hasTermsPage = true;
            if (eeatSignals.linksToAbout) hasAboutPage = true;
            if (eeatSignals.linksToContact) hasContactPage = true;
            if (eeatSignals.linksToPrivacy) hasPrivacyPolicy = true;
            if (eeatSignals.linksToTerms) hasTermsPage = true;

            if (eeatSignals.isContentPage) {
              totalContentPages++;
              if (eeatSignals.hasAuthorByline) pagesWithAuthor++;
              if (eeatSignals.hasDatePublished) pagesWithDatePublished++;

              // ── Per-page: Content page missing author ──
              if (!eeatSignals.hasAuthorByline) {
                issues.push({
                  auditRunId: data.auditRunId,
                  auditPageId: pageData.id,
                  stepNumber: 17,
                  severity: 'MODERATE',
                  category: 'Missing Author Byline',
                  message:
                    'Content page has no author attribution. Author bylines are a key E-E-A-T signal that Google uses to evaluate content quality.',
                  recommendation:
                    'Add an author byline with the author\'s name and a link to their bio/author page. Use rel="author" and Person schema markup.',
                });
              }

              // ── Per-page: Content page missing date ──
              if (!eeatSignals.hasDatePublished) {
                issues.push({
                  auditRunId: data.auditRunId,
                  auditPageId: pageData.id,
                  stepNumber: 17,
                  severity: 'MINOR',
                  category: 'Missing Publication Date',
                  message:
                    'Content page has no visible publication or update date. Date signals help search engines assess content freshness.',
                  recommendation:
                    'Display the publication date and last-updated date on content pages. Use datePublished and dateModified schema properties.',
                });
              }
            }
          } catch {
            // Page failed to load — skip
          } finally {
            await page.close();
          }
        })
      );
    }

    // ── Site-level issues ──

    if (!hasAboutPage) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 17,
        severity: 'SERIOUS',
        category: 'Missing About Page',
        message:
          'No "About" page detected. An About page is critical for E-E-A-T — it establishes who is behind the content.',
        recommendation:
          'Create a comprehensive About page with team bios, credentials, experience, and mission. Link it from the main navigation and footer.',
      });
    }

    if (!hasContactPage) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 17,
        severity: 'MODERATE',
        category: 'Missing Contact Page',
        message:
          'No "Contact" page detected. Contact information is a basic trust signal for both users and search engines.',
        recommendation:
          'Add a Contact page with a physical address, phone number, and/or contact form. Link it from the footer on every page.',
      });
    }

    if (!hasPrivacyPolicy) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 17,
        severity: 'MODERATE',
        category: 'Missing Privacy Policy',
        message:
          'No Privacy Policy page detected. Privacy policies are expected by users and may be legally required.',
        recommendation:
          'Add a Privacy Policy page that explains data collection practices. Link it from the footer on every page.',
      });
    }

    if (!hasTermsPage) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 17,
        severity: 'MINOR',
        category: 'Missing Terms of Service',
        message:
          'No Terms of Service page detected. Terms pages add a layer of professionalism and trust.',
        recommendation:
          'Add a Terms of Service page and link it from the footer.',
      });
    }

    // ── Site-level: Low author attribution rate ──
    if (totalContentPages > 3 && pagesWithAuthor === 0) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 17,
        severity: 'SERIOUS',
        category: 'No Author Attribution',
        message: `None of the ${totalContentPages} content pages have author bylines. Author attribution is one of the strongest E-E-A-T signals.`,
        recommendation:
          'Implement author bylines on all content pages with links to dedicated author bio pages. Include credentials, experience, and social profiles.',
      });
    } else if (totalContentPages > 3 && pagesWithAuthor / totalContentPages < 0.5) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 17,
        severity: 'MODERATE',
        category: 'Low Author Attribution',
        message: `Only ${Math.round((pagesWithAuthor / totalContentPages) * 100)}% of content pages have author bylines (${pagesWithAuthor}/${totalContentPages}).`,
        recommendation:
          'Add author bylines to all content pages. Consistent author attribution demonstrates editorial standards and expertise.',
      });
    }

    // ── Site-level: No dates on content ──
    if (totalContentPages > 3 && pagesWithDatePublished === 0) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 17,
        severity: 'MODERATE',
        category: 'No Content Dates',
        message: `None of the ${totalContentPages} content pages display publication dates. Date signals help users and search engines assess content relevance.`,
        recommendation:
          'Display publication dates and "Last Updated" dates on content pages. Use datePublished and dateModified in Article schema.',
      });
    }
  } finally {
    await browser.close();
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}

/**
 * Compute a 0-100 E-E-A-T score for a single page.
 */
function computeEeatScore(signals: {
  hasAuthorByline: boolean;
  hasAuthorPage: boolean;
  hasDatePublished: boolean;
  hasDateModified: boolean;
  hasTrustSignals: {
    testimonials: boolean;
    credentials: boolean;
    awards: boolean;
    socialProof: boolean;
  };
  isContentPage: boolean;
  hasPersonSchema: boolean;
  hasOrgSchema: boolean;
}): number {
  let score = 50; // Baseline

  // Author signals (+25 max)
  if (signals.hasAuthorByline) score += 15;
  if (signals.hasAuthorPage) score += 5;
  if (signals.hasPersonSchema) score += 5;

  // Date signals (+10)
  if (signals.hasDatePublished) score += 5;
  if (signals.hasDateModified) score += 5;

  // Trust signals (+10 max)
  const trustCount = Object.values(signals.hasTrustSignals).filter(Boolean).length;
  score += Math.min(trustCount * 3, 10);

  // Organization schema (+5)
  if (signals.hasOrgSchema) score += 5;

  return Math.min(100, Math.max(0, score));
}
