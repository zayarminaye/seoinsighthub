import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { E2E_SESSION_COOKIE, isE2EBypassEnabled } from '@/lib/e2eAuth';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/clerk(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (isE2EBypassEnabled()) {
    if (request.nextUrl.pathname.startsWith('/api/e2e/')) return;
    if (request.cookies.get(E2E_SESSION_COOKIE)?.value) return;
  }

  if (!isPublicRoute(request)) {
    const authState = await auth();
    await auth.protect();

    const claims = authState.sessionClaims as
      | { metadata?: { disabled?: boolean }; public_metadata?: { disabled?: boolean } }
      | undefined;
    const isDisabled =
      claims?.metadata?.disabled === true || claims?.public_metadata?.disabled === true;

    if (isDisabled) {
      return Response.redirect(new URL('/sign-in', request.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
