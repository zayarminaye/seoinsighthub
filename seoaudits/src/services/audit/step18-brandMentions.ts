import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

/**
 * Step 18: Brand Mention Tracking
 *
 * Analyzes brand consistency and presence signals across the site:
 * - Brand name consistency in titles, meta, and content
 * - Social profile presence and consistency (from sameAs data)
 * - Organization schema completeness
 * - Brand-related structured data quality
 */
export async function runStep18BrandMentions(data: StepJobData): Promise<void> {
  const audit = await prisma.auditRun.findUnique({
    where: { id: data.auditRunId },
    select: { targetDomain: true },
  });

  if (!audit) return;

  const pages = await prisma.auditPage.findMany({
    where: { auditRunId: data.auditRunId },
    select: {
      id: true,
      url: true,
      titleTag: true,
      metaDescription: true,
      details: true,
      hasSameAs: true,
      sameAsUrls: true,
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

  // Extract the brand name from the domain
  const domain = audit.targetDomain.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const domainParts = domain.split('.');
  const brandName = domainParts[0] ?? domain;

  // ── Analyze Organization schema across site ──
  let hasOrgSchema = false;
  let orgSchemaData: {
    name?: string;
    logo?: string;
    sameAs?: string[];
    contactPoint?: boolean;
    address?: boolean;
  } | null = null;

  for (const page of pages) {
    const details = page.details as Record<string, unknown> | null;
    const schemas = (details?.schemaObjects as Array<{ type: string; data: Record<string, unknown> }>) ?? [];

    for (const schema of schemas) {
      if (schema.type === 'Organization' || schema.type === 'LocalBusiness') {
        hasOrgSchema = true;
        const d = schema.data;
        orgSchemaData = {
          name: d.name as string | undefined,
          logo: d.logo as string | undefined,
          sameAs: d.sameAs as string[] | undefined,
          contactPoint: !!d.contactPoint,
          address: !!d.address,
        };
        break;
      }
    }
    if (hasOrgSchema) break;
  }

  // ── Organization schema issues ──
  if (!hasOrgSchema) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 18,
      severity: 'SERIOUS',
      category: 'Missing Organization Schema',
      message:
        'No Organization structured data found. Organization schema helps search engines and AI systems understand your brand identity.',
      recommendation:
        'Add Organization schema to your homepage with name, logo, URL, sameAs (social profiles), contactPoint, and address. This establishes your Knowledge Panel eligibility.',
    });
  } else if (orgSchemaData) {
    if (!orgSchemaData.logo) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 18,
        severity: 'MODERATE',
        category: 'Incomplete Organization Schema',
        message: 'Organization schema is missing a logo property.',
        recommendation:
          'Add a logo URL to your Organization schema. This may appear in your Google Knowledge Panel.',
      });
    }

    if (!orgSchemaData.sameAs || orgSchemaData.sameAs.length === 0) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 18,
        severity: 'MODERATE',
        category: 'Missing Social Profiles in Schema',
        message:
          'Organization schema has no sameAs property linking to social media profiles.',
        recommendation:
          'Add sameAs array with URLs to your official LinkedIn, Twitter/X, Facebook, Instagram, YouTube, and GitHub profiles.',
      });
    }

    if (!orgSchemaData.contactPoint) {
      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: null,
        stepNumber: 18,
        severity: 'MINOR',
        category: 'Missing Contact in Schema',
        message: 'Organization schema is missing contactPoint property.',
        recommendation:
          'Add contactPoint with telephone, email, and contactType to your Organization schema.',
      });
    }
  }

  // ── Brand name consistency in titles ──
  const titlePages = pages.filter((p) => p.titleTag && p.titleTag.trim().length > 0);
  const pagesWithBrandInTitle = titlePages.filter(
    (p) => p.titleTag!.toLowerCase().includes(brandName.toLowerCase())
  );

  if (titlePages.length > 3 && pagesWithBrandInTitle.length === 0) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 18,
      severity: 'MODERATE',
      category: 'Brand Name Missing from Titles',
      message: `None of the ${titlePages.length} pages include the brand name "${brandName}" in their title tags.`,
      recommendation: `Include your brand name in title tags using a consistent format like "Page Title | ${brandName}" or "Page Title - ${brandName}". This reinforces brand recognition in search results.`,
    });
  } else if (
    titlePages.length > 5 &&
    pagesWithBrandInTitle.length / titlePages.length < 0.3
  ) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 18,
      severity: 'MINOR',
      category: 'Inconsistent Brand in Titles',
      message: `Only ${Math.round((pagesWithBrandInTitle.length / titlePages.length) * 100)}% of pages include the brand name in their title tags (${pagesWithBrandInTitle.length}/${titlePages.length}).`,
      recommendation: `Use a consistent title tag format that includes your brand name, e.g. "Page Title | ${brandName}".`,
    });
  }

  // ── Social profile coverage ──
  const allSameAsUrls = new Set<string>();
  for (const page of pages) {
    if (page.sameAsUrls && Array.isArray(page.sameAsUrls)) {
      for (const url of page.sameAsUrls as string[]) {
        allSameAsUrls.add(url);
      }
    }
  }

  const SOCIAL_PLATFORMS = [
    { name: 'LinkedIn', patterns: ['linkedin.com'] },
    { name: 'Twitter/X', patterns: ['twitter.com', 'x.com'] },
    { name: 'Facebook', patterns: ['facebook.com', 'fb.com'] },
    { name: 'Instagram', patterns: ['instagram.com'] },
    { name: 'YouTube', patterns: ['youtube.com'] },
  ];

  const missingSocials: string[] = [];
  const presentSocials: string[] = [];

  for (const platform of SOCIAL_PLATFORMS) {
    const found = Array.from(allSameAsUrls).some((url) =>
      platform.patterns.some((p) => url.includes(p))
    );
    if (found) {
      presentSocials.push(platform.name);
    } else {
      missingSocials.push(platform.name);
    }
  }

  if (missingSocials.length >= 3 && allSameAsUrls.size > 0) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 18,
      severity: 'MINOR',
      category: 'Limited Social Presence',
      message: `Brand is present on ${presentSocials.join(', ') || 'no platforms'} but missing from ${missingSocials.join(', ')}.`,
      recommendation:
        'Establish presence on major social platforms and add all profile URLs to your Organization schema sameAs property.',
    });
  }

  if (allSameAsUrls.size === 0 && pages.length > 3) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 18,
      severity: 'MODERATE',
      category: 'No Social Profile Links',
      message:
        'No social media profile links (sameAs) found anywhere on the site. Social profiles help establish brand identity and authority.',
      recommendation:
        'Link to your official social media profiles using Organization schema sameAs property and visible social icons on the site.',
    });
  }

  // ── Favicon and branding consistency ──
  // Check if homepage has proper OpenGraph meta
  const homePage = pages.find((p) => {
    try {
      const u = new URL(p.url);
      return u.pathname === '/' || u.pathname === '';
    } catch {
      return false;
    }
  });

  if (homePage) {
    const homeDetails = homePage.details as Record<string, unknown> | null;
    const hasOgTitle = !!(homeDetails?.ogTitle as string);
    const hasOgImage = !!(homeDetails?.ogImage as string);

    if (!hasOgTitle || !hasOgImage) {
      const missing: string[] = [];
      if (!hasOgTitle) missing.push('og:title');
      if (!hasOgImage) missing.push('og:image');

      issues.push({
        auditRunId: data.auditRunId,
        auditPageId: homePage.id,
        stepNumber: 18,
        severity: 'MODERATE',
        category: 'Missing OpenGraph Tags',
        message: `Homepage is missing ${missing.join(' and ')}. OpenGraph tags control how your brand appears when shared on social media.`,
        recommendation:
          'Add og:title, og:description, og:image, and og:url meta tags to all pages. The og:image should be your brand logo or a branded social card (1200x630px).',
      });
    }
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
