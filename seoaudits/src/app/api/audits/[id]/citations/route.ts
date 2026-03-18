import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { TriggerCitationsSchema } from '@/lib/validators/citation';
import { enqueueCitationAnalysis } from '@/services/queue/queues';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { resolveGeminiApiKeyForUser } from '@/lib/geminiApiKeys';

function normalizeUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^0\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;

  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }

  return false;
}

// POST /api/audits/:id/citations - Trigger citation gap analysis
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const rawBody = (await req.json()) as {
      competitorDomains?: string[];
      [key: string]: unknown;
    };
    const body = {
      ...rawBody,
      ...(Array.isArray(rawBody.competitorDomains)
        ? {
            competitorDomains: rawBody.competitorDomains.map((d) =>
              typeof d === 'string' ? normalizeUrlInput(d) : d
            ),
          }
        : {}),
    };
    const input = TriggerCitationsSchema.parse(body);

    for (const domain of input.competitorDomains) {
      const parsed = new URL(domain);
      if (isPrivateOrLocalHostname(parsed.hostname)) {
        return NextResponse.json(
          { error: 'Competitor domains must be public websites.' },
          { status: 400 }
        );
      }
    }

    const enabled = await isFeatureEnabled(
      'audit.citation-analysis',
      user.plan as 'free' | 'starter' | 'pro' | 'enterprise'
    );
    if (!enabled) {
      return NextResponse.json(
        { error: 'Citation analysis is not enabled for your plan.' },
        { status: 403 }
      );
    }

    await enqueueCitationAnalysis({
      auditRunId: id,
      seedKeywords: input.seedKeywords,
      competitorDomains: input.competitorDomains,
      queriesPerKeyword: input.queriesPerKeyword,
    });

    const resolvedKey = await resolveGeminiApiKeyForUser(user.id);
    const heuristicFallback = resolvedKey.source === 'none';

    return NextResponse.json({
      message: 'Citation analysis queued',
      auditId: id,
      queryCount: input.seedKeywords.length * input.queriesPerKeyword,
      mode: heuristicFallback ? 'heuristic' : 'model',
      disclaimer: heuristicFallback
        ? 'No Gemini API key is configured for your account or admin fallback, so heuristic analysis will be used.'
        : null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input. Please check your request and try again.' }, { status: 400 });
    }
    console.error('POST /api/audits/[id]/citations error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/audits/:id/citations - Get citation gap results
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const queries = await prisma.citationQuery.findMany({
      where: { auditRunId: id },
      include: {
        results: {
          include: { gaps: true },
        },
      },
    });

    return NextResponse.json({ data: queries });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
