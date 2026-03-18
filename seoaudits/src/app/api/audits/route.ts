import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { CreateAuditSchema, ListAuditsSchema } from '@/lib/validators/audit';
import { enqueueAudit } from '@/services/queue/queues';
import { checkRateLimit, AUDIT_CREATE_RATE_LIMIT } from '@/lib/rateLimit';
import { getPlanTier } from '@/lib/planTiers';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { logSecurityEvent } from '@/lib/securityLogger';

function normalizeUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return true;
  }

  // IPv4 private/local ranges
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^0\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;

  // IPv6 private/local ranges
  if (
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }

  return false;
}

async function isReachableWebsite(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (isPrivateOrLocalHostname(parsed.hostname)) return false;

  try {
    const head = await fetch(parsed.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    if (head.status > 0) return true;
  } catch {
    // Try GET fallback for hosts that reject HEAD
  }

  try {
    const get = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    return get.status > 0;
  } catch {
    return false;
  }
}

// POST /api/audits - Create a new audit run
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // Rate limit: prevent rapid-fire audit creation
    const rl = await checkRateLimit(`audit-create:${user.id}`, AUDIT_CREATE_RATE_LIMIT);
    if (!rl.success) {
      logSecurityEvent({ type: 'RATE_LIMIT_HIT', userId: user.id, path: '/api/audits', details: 'Audit creation rate limit exceeded' });
      return NextResponse.json(
        { error: 'Too many audit requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
      );
    }

    const rawBody = (await req.json()) as {
      domain?: string;
      competitorDomains?: string[];
      [key: string]: unknown;
    };
    const body = {
      ...rawBody,
      ...(typeof rawBody.domain === 'string'
        ? { domain: normalizeUrlInput(rawBody.domain) }
        : {}),
      ...(Array.isArray(rawBody.competitorDomains)
        ? {
            competitorDomains: rawBody.competitorDomains.map((d) =>
              typeof d === 'string' ? normalizeUrlInput(d) : d
            ),
          }
        : {}),
    };
    const input = CreateAuditSchema.parse(body);
    const target = new URL(input.domain);

    if (isPrivateOrLocalHostname(target.hostname)) {
      logSecurityEvent({
        type: 'SUSPICIOUS_REQUEST',
        userId: user.id,
        path: '/api/audits',
        details: `Blocked local/private target: ${target.hostname}`,
      });
      return NextResponse.json(
        { error: 'Target domain must be a public website.' },
        { status: 400 }
      );
    }

    const reachable = await isReachableWebsite(input.domain);
    if (!reachable) {
      return NextResponse.json(
        {
          error:
            'Target URL is not reachable right now. Please verify the site is live and publicly accessible.',
        },
        { status: 400 }
      );
    }

    // Enforce plan tier limits
    const tier = getPlanTier(user.plan);
    const maxPagesOverrideEnabled = await isFeatureEnabled(
      'audit.max-pages-override',
      user.plan as 'free' | 'starter' | 'pro' | 'enterprise'
    );
    const enforcedMaxPages = maxPagesOverrideEnabled
      ? input.maxPages
      : Math.min(input.maxPages, tier.maxPagesPerAudit);
    let enforcedSteps = input.selectedSteps.filter((s) => tier.availableSteps.includes(s));

    // Feature-flag gating by step groups
    const [uEnabled, rEnabled, aEnabled, citationEnabled] = await Promise.all([
      isFeatureEnabled('audit.steps.usability', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
      isFeatureEnabled('audit.steps.relevance', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
      isFeatureEnabled('audit.steps.authority', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
      isFeatureEnabled('audit.citation-analysis', user.plan as 'free' | 'starter' | 'pro' | 'enterprise'),
    ]);

    enforcedSteps = enforcedSteps.filter((step) => {
      if (step === 16) return aEnabled && citationEnabled;
      if (step >= 1 && step <= 7) return uEnabled;
      if (step >= 8 && step <= 14) return rEnabled;
      if (step >= 15 && step <= 18) return aEnabled;
      return false;
    });

    if (enforcedSteps.length === 0) {
      return NextResponse.json(
        { error: 'No selected steps are currently enabled for your plan.' },
        { status: 400 }
      );
    }

    // Check monthly audit limit
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const auditCount = await prisma.auditRun.count({
      where: {
        userId: user.id,
        createdAt: { gte: thisMonth },
      },
    });

    // `user.auditLimit` is the effective quota (plan default or admin override).
    const monthlyLimit = user.auditLimit;
    if (auditCount >= monthlyLimit) {
      logSecurityEvent({ type: 'PLAN_LIMIT_REACHED', userId: user.id, path: '/api/audits', details: `Monthly limit ${monthlyLimit} reached` });
      return NextResponse.json(
        { error: `Monthly audit limit reached (${monthlyLimit}). Upgrade your plan for more audits.` },
        { status: 429 }
      );
    }

    const auditRun = await prisma.auditRun.create({
      data: {
        userId: user.id,
        targetDomain: input.domain,
        selectedSteps: enforcedSteps,
        seedKeywords: input.seedKeywords,
        competitorDomains: input.competitorDomains,
        maxPages: enforcedMaxPages,
      },
    });

    await enqueueAudit(auditRun.id);

    return NextResponse.json(
      { auditId: auditRun.id, status: auditRun.status },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.name === 'ZodError') {
      logSecurityEvent({ type: 'INVALID_INPUT', path: '/api/audits', details: 'Zod validation failed' });
      return NextResponse.json({ error: 'Invalid input. Please check your request and try again.' }, { status: 400 });
    }
    console.error('POST /api/audits error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/audits - List user's audits
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const input = ListAuditsSchema.parse(params);

    const audits = await prisma.auditRun.findMany({
      where: {
        userId: user.id,
        ...(input.status && { status: input.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      select: {
        id: true,
        targetDomain: true,
        status: true,
        selectedSteps: true,
        totalPages: true,
        completedPages: true,
        uraScoreU: true,
        uraScoreR: true,
        uraScoreA: true,
        uraScoreOverall: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const hasMore = audits.length > input.limit;
    const data = hasMore ? audits.slice(0, -1) : audits;
    const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

    return NextResponse.json({ data, nextCursor });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid query parameters.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
