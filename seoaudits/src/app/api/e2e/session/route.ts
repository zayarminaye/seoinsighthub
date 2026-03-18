import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPlanTier } from '@/lib/planTiers';
import {
  E2E_SESSION_COOKIE,
  encodeE2ESession,
  isE2EBypassEnabled,
  type E2ESession,
} from '@/lib/e2eAuth';

const SessionSchema = z.object({
  clerkId: z.string().min(3).default('e2e-user'),
  email: z.string().email().default('e2e@example.com'),
  name: z.string().min(1).optional(),
  role: z.enum(['user', 'admin']).default('user'),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).default('starter'),
  disabled: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  if (!isE2EBypassEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const input = SessionSchema.parse(await req.json().catch(() => ({})));
  const session: E2ESession = {
    clerkId: input.clerkId,
    email: input.email,
    name: input.name,
    role: input.role,
    plan: input.plan,
    disabled: input.disabled,
  };

  const planTier = getPlanTier(session.plan);
  await prisma.user.upsert({
    where: { clerkId: session.clerkId },
    update: {
      email: session.email,
      name: session.name ?? null,
      plan: session.plan,
    },
    create: {
      clerkId: session.clerkId,
      email: session.email,
      name: session.name ?? null,
      plan: session.plan,
      auditLimit: planTier.auditsPerMonth,
    },
  });

  const res = NextResponse.json({
    data: {
      clerkId: session.clerkId,
      role: session.role,
      plan: session.plan,
    },
  });
  res.cookies.set(E2E_SESSION_COOKIE, encodeE2ESession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60,
  });
  return res;
}

export async function DELETE() {
  if (!isE2EBypassEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(E2E_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0,
  });
  return res;
}
