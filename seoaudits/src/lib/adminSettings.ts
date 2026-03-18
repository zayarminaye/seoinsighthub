import { prisma } from './prisma';

const DEFAULT_GEMINI_MAX_QUERIES_PER_AUDIT = 12;

function isMissingDatabaseObjectError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    ((err as { code?: string }).code === 'P2021' ||
      (err as { code?: string }).code === 'P2022')
  );
}

export async function getGeminiMaxQueriesPerAudit(): Promise<number> {
  try {
    const settings = await prisma.adminSettings.findUnique({
      where: { id: 'global' },
      select: { geminiMaxQueriesPerAudit: true },
    });
    return settings?.geminiMaxQueriesPerAudit ?? DEFAULT_GEMINI_MAX_QUERIES_PER_AUDIT;
  } catch (err) {
    if (isMissingDatabaseObjectError(err)) {
      return DEFAULT_GEMINI_MAX_QUERIES_PER_AUDIT;
    }
    throw err;
  }
}

export async function setGeminiMaxQueriesPerAudit(adminId: string, maxQueries: number) {
  const bounded = Math.max(1, Math.min(100, Math.trunc(maxQueries)));
  const updated = await prisma.adminSettings.upsert({
    where: { id: 'global' },
    update: {
      geminiMaxQueriesPerAudit: bounded,
      updatedBy: adminId,
    },
    create: {
      id: 'global',
      geminiMaxQueriesPerAudit: bounded,
      updatedBy: adminId,
    },
    select: {
      geminiMaxQueriesPerAudit: true,
    },
  });
  return updated.geminiMaxQueriesPerAudit;
}
