import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { prisma } from '@/lib/prisma';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { logSecurityEvent } from '@/lib/securityLogger';
import { getPlanTier } from '@/lib/planTiers';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response('Missing CLERK_WEBHOOK_SECRET', { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    logSecurityEvent({ type: 'SUSPICIOUS_REQUEST', path: '/api/webhooks/clerk', details: 'Missing svix headers' });
    return new Response('Missing svix headers', { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let event: WebhookEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    logSecurityEvent({ type: 'SUSPICIOUS_REQUEST', path: '/api/webhooks/clerk', details: 'Invalid webhook signature' });
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'user.created' || event.type === 'user.updated') {
    const { id, email_addresses, first_name, last_name, public_metadata } = event.data;
    const email = email_addresses[0]?.email_address;
    if (!email) return new Response('No email', { status: 400 });

    const name = [first_name, last_name].filter(Boolean).join(' ') || null;
    const plan =
      typeof public_metadata?.plan === 'string' ? public_metadata.plan : 'free';
    const planTier = getPlanTier(plan);

    await prisma.user.upsert({
      where: { clerkId: id },
      update: { email, name, plan },
      create: {
        clerkId: id,
        email,
        name,
        plan,
        auditLimit: planTier.auditsPerMonth,
      },
    });
  }

  if (event.type === 'user.deleted') {
    const { id } = event.data;
    if (id) {
      await prisma.user.delete({ where: { clerkId: id } }).catch(() => {});
    }
  }

  return new Response('OK', { status: 200 });
}
