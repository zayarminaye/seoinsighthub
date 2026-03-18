import { prisma } from './prisma';
import { decryptSecret, encryptSecret } from './cryptoSecret';

export type GeminiKeySource = 'user' | 'admin' | 'none';

export interface ResolvedGeminiKey {
  apiKey: string | null;
  source: GeminiKeySource;
}

function isMissingDatabaseObjectError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    ((err as { code?: string }).code === 'P2021' ||
      (err as { code?: string }).code === 'P2022')
  );
}

function normalizeApiKey(value: string): string {
  return value.trim();
}

export async function resolveGeminiApiKeyForUser(userId: string): Promise<ResolvedGeminiKey> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { geminiApiKeyEncrypted: true },
    });

    if (user?.geminiApiKeyEncrypted) {
      try {
        const apiKey = normalizeApiKey(decryptSecret(user.geminiApiKeyEncrypted));
        if (apiKey) return { apiKey, source: 'user' };
      } catch (err) {
        console.warn('[geminiApiKeys] Failed to decrypt user Gemini key:', err);
      }
    }

    const adminSettings = await prisma.adminSettings.findUnique({
      where: { id: 'global' },
      select: { geminiApiKeyEncrypted: true },
    });
    if (adminSettings?.geminiApiKeyEncrypted) {
      try {
        const apiKey = normalizeApiKey(decryptSecret(adminSettings.geminiApiKeyEncrypted));
        if (apiKey) return { apiKey, source: 'admin' };
      } catch (err) {
        console.warn('[geminiApiKeys] Failed to decrypt admin Gemini key:', err);
      }
    }
  } catch (err) {
    if (isMissingDatabaseObjectError(err)) {
      console.warn('[geminiApiKeys] DB objects missing; treating Gemini key as unconfigured.');
      return { apiKey: null, source: 'none' };
    }
    throw err;
  }

  return { apiKey: null, source: 'none' };
}

export async function getUserGeminiKeyStatus(userId: string): Promise<{ configured: boolean }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { geminiApiKeyEncrypted: true },
    });
    return { configured: Boolean(user?.geminiApiKeyEncrypted) };
  } catch (err) {
    if (isMissingDatabaseObjectError(err)) return { configured: false };
    throw err;
  }
}

export async function getAdminGeminiKeyStatus(): Promise<{ configured: boolean }> {
  try {
    const settings = await prisma.adminSettings.findUnique({
      where: { id: 'global' },
      select: { geminiApiKeyEncrypted: true },
    });
    return { configured: Boolean(settings?.geminiApiKeyEncrypted) };
  } catch (err) {
    if (isMissingDatabaseObjectError(err)) return { configured: false };
    throw err;
  }
}

export async function setUserGeminiApiKey(userId: string, apiKey: string | null) {
  const normalized = apiKey ? normalizeApiKey(apiKey) : '';
  const encrypted = normalized ? encryptSecret(normalized) : null;
  await prisma.user.update({
    where: { id: userId },
    data: { geminiApiKeyEncrypted: encrypted },
  });
}

export async function setAdminGeminiApiKey(adminId: string, apiKey: string | null) {
  const normalized = apiKey ? normalizeApiKey(apiKey) : '';
  const encrypted = normalized ? encryptSecret(normalized) : null;
  await prisma.adminSettings.upsert({
    where: { id: 'global' },
    update: {
      geminiApiKeyEncrypted: encrypted,
      updatedBy: adminId,
    },
    create: {
      id: 'global',
      geminiApiKeyEncrypted: encrypted,
      updatedBy: adminId,
    },
  });
}
