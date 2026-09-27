import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

/**
 * Clerk middleware, mounted only when there is a key to mount it with.
 *
 * Clerk's middleware throws without a publishable key, and this project must
 * boot with no keys at all — that is how it is developed and how CI runs. So
 * the handler is constructed **lazily, on the first request that needs it**,
 * and a construction failure degrades to pass-through rather than a 500 on
 * every route.
 *
 * Degrading is safe here because middleware is a convenience, not the security
 * boundary: every `/api/*` route requires a session server-side and answers
 * `ASE01` (401) on its own. Losing middleware costs a redirect, never an
 * authorization check. The 401 page is what the client shows in that case.
 */

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

type Handler = (request: NextRequest, event: NextFetchEvent) => Response | Promise<Response>;

let handler: Handler | null = null;
let failed = false;

async function resolveHandler(): Promise<Handler | null> {
  if (handler || failed) return handler;
  try {
    const { clerkMiddleware } = await import('@clerk/nextjs/server');
    handler = clerkMiddleware() as unknown as Handler;
  } catch (error) {
    failed = true;
    // Not fatal by design — see the note above. The API's 401 page covers it.
    console.warn('[auth] Clerk middleware unavailable; falling back to the API 401 path', error);
  }
  return handler;
}

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!clerkEnabled) return NextResponse.next();
  const clerk = await resolveHandler();
  if (!clerk) return NextResponse.next();
  return clerk(request, event);
}

/** Everything except Next's internals and static files. */
export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
