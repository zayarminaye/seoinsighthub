import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const E2E_SESSION_COOKIE = 'e2e_session';

export type E2EPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type E2ERole = 'user' | 'admin';

export interface E2ESession {
  clerkId: string;
  email: string;
  name?: string;
  role: E2ERole;
  plan: E2EPlan;
  disabled: boolean;
}

export function isE2EBypassEnabled(): boolean {
  return process.env.E2E_BYPASS_CLERK === 'true';
}

export function encodeE2ESession(session: E2ESession): string {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
}

export function decodeE2ESession(raw: string): E2ESession | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<E2ESession>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.clerkId !== 'string' || parsed.clerkId.trim().length === 0) return null;
    if (typeof parsed.email !== 'string' || parsed.email.trim().length === 0) return null;
    const role = parsed.role === 'admin' ? 'admin' : 'user';
    const plan: E2EPlan =
      parsed.plan === 'starter' || parsed.plan === 'pro' || parsed.plan === 'enterprise'
        ? parsed.plan
        : 'free';

    return {
      clerkId: parsed.clerkId,
      email: parsed.email,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      role,
      plan,
      disabled: parsed.disabled === true,
    };
  } catch {
    return null;
  }
}

export async function getE2ESessionFromCookies(): Promise<E2ESession | null> {
  if (!isE2EBypassEnabled()) return null;
  const store = await cookies();
  const raw = store.get(E2E_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeE2ESession(raw);
}

export function getE2ESessionFromRequest(req: NextRequest): E2ESession | null {
  if (!isE2EBypassEnabled()) return null;
  const raw = req.cookies.get(E2E_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeE2ESession(raw);
}
