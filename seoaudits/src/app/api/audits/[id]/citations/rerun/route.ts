import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { enqueueCitationAnalysis } from '@/services/queue/queues';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { resolveGeminiApiKeyForUser } from '@/lib/geminiApiKeys';

// POST /api/audits/:id/citations/rerun - Re-run citation analysis using saved audit inputs
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const audit = await prisma.auditRun.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        seedKeywords: true,
        competitorDomains: true,
      },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
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

    const seedKeywords = (audit.seedKeywords ?? []).map((k) => k.trim()).filter(Boolean);
    const competitorDomains = (audit.competitorDomains ?? []).map((d) => d.trim()).filter(Boolean);

    if (seedKeywords.length === 0 || competitorDomains.length === 0) {
      return NextResponse.json(
        {
          code: 'MISSING_CITATION_INPUTS',
          error:
            'This audit is missing seed keywords or competitor domains. Create a new audit with citation inputs first.',
        },
        { status: 400 }
      );
    }

    const queriesPerKeyword = 4;
    await enqueueCitationAnalysis({
      auditRunId: id,
      seedKeywords,
      competitorDomains,
      queriesPerKeyword,
    });

    const resolvedKey = await resolveGeminiApiKeyForUser(user.id);
    const heuristicFallback = resolvedKey.source === 'none';

    return NextResponse.json({
      message: 'Citation analysis re-run queued',
      auditId: id,
      queryCount: seedKeywords.length * queriesPerKeyword,
      mode: heuristicFallback ? 'heuristic' : 'model',
      disclaimer: heuristicFallback
        ? 'No Gemini API key is configured for your account or admin fallback, so heuristic analysis will be used.'
        : null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('POST /api/audits/[id]/citations/rerun error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
