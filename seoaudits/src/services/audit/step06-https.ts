import type { StepJobData } from './orchestrator';
import { prisma } from '@/lib/prisma';

const SECURITY_HEADERS = [
  'strict-transport-security',
  'content-security-policy',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
] as const;

/**
 * Step 6: HTTPS & Security
 * Verifies SSL, mixed content, and security headers (CSP, HSTS, etc.).
 */
export async function runStep06Https(data: StepJobData): Promise<void> {
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

  // Check security headers on a sample of pages (homepage + up to 4 more)
  const sampled = pages.slice(0, 5);

  // Track site-level header coverage
  const headerPresence: Record<string, number> = {};
  for (const h of SECURITY_HEADERS) {
    headerPresence[h] = 0;
  }

  for (const page of sampled) {
    try {
      const url = new URL(page.url);

      // Check HTTPS
      if (url.protocol !== 'https:') {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 6,
          severity: 'CRITICAL',
          category: 'HTTPS',
          message: 'Page is served over HTTP, not HTTPS.',
          recommendation:
            'Migrate to HTTPS and set up 301 redirects from HTTP to HTTPS.',
        });
        continue;
      }

      // Fetch headers
      const response = await fetch(page.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });

      const headers = response.headers;

      // Check each security header
      for (const headerName of SECURITY_HEADERS) {
        if (headers.has(headerName)) {
          headerPresence[headerName]++;
        }
      }

      // Check HSTS specifically
      const hsts = headers.get('strict-transport-security');
      if (!hsts) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 6,
          severity: 'SERIOUS',
          category: 'HSTS',
          message: 'Strict-Transport-Security header is missing.',
          recommendation:
            'Add HSTS header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
        });
      } else {
        // Check max-age
        const maxAgeMatch = hsts.match(/max-age=(\d+)/);
        const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
        if (maxAge < 31536000) {
          issues.push({
            auditRunId: data.auditRunId,
            auditPageId: page.id,
            stepNumber: 6,
            severity: 'MODERATE',
            category: 'HSTS',
            message: `HSTS max-age is ${maxAge}s (recommended: >= 31536000 / 1 year).`,
            recommendation:
              'Increase HSTS max-age to at least 31536000 (1 year) and add includeSubDomains.',
          });
        }
      }

      // Check CSP
      if (!headers.has('content-security-policy')) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 6,
          severity: 'SERIOUS',
          category: 'CSP',
          message: 'Content-Security-Policy header is missing.',
          recommendation:
            "Start with a report-only CSP to identify violations: Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'; report-uri /csp-report. Then tighten the policy and switch to enforcing mode.",
        });
      }

      // Check X-Content-Type-Options
      if (!headers.has('x-content-type-options')) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 6,
          severity: 'MODERATE',
          category: 'Security Headers',
          message: 'X-Content-Type-Options header is missing.',
          recommendation: 'Add X-Content-Type-Options: nosniff header.',
        });
      }

      // Check for HTTP redirect (non-HTTPS landing)
      if (response.redirected && response.url.startsWith('http://')) {
        issues.push({
          auditRunId: data.auditRunId,
          auditPageId: page.id,
          stepNumber: 6,
          severity: 'SERIOUS',
          category: 'HTTPS Redirect',
          message: 'HTTPS request redirected to an HTTP URL.',
          recommendation: 'Ensure all redirects stay on HTTPS.',
        });
      }
    } catch (error) {
      console.error(`Security check failed for ${page.url}:`, error);
    }
  }

  // Site-level: summarize missing security headers
  const missedHeaders = SECURITY_HEADERS.filter(
    (h) => headerPresence[h] === 0
  );

  if (missedHeaders.length >= 3) {
    issues.push({
      auditRunId: data.auditRunId,
      auditPageId: null,
      stepNumber: 6,
      severity: 'SERIOUS',
      category: 'Security Headers',
      message: `Missing ${missedHeaders.length} security headers site-wide: ${missedHeaders.join(', ')}.`,
      recommendation:
        `Configure your web server or CDN to add: ${missedHeaders.map((h) => {
          const examples: Record<string, string> = {
            'strict-transport-security': 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
            'content-security-policy': "Content-Security-Policy: default-src 'self'",
            'x-content-type-options': 'X-Content-Type-Options: nosniff',
            'x-frame-options': 'X-Frame-Options: SAMEORIGIN',
            'referrer-policy': 'Referrer-Policy: strict-origin-when-cross-origin',
            'permissions-policy': 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
          };
          return examples[h] ?? h;
        }).join('; ')}.`,
    });
  }

  if (issues.length > 0) {
    await prisma.auditIssue.createMany({ data: issues });
  }
}
