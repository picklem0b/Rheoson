'use client';

import { ClerkProvider, SignInButton, UserButton, useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';

import { createClerkSession, setSession } from '@/lib/session';

/**
 * The production session provider, isolated in one component.
 *
 * Clerk is mounted here and nowhere else. `useAuth` is the only source of a
 * token, and this component translates it into the `Session` interface the rest
 * of the app already speaks — so every store, hook and request stays provider
 * agnostic and the dev posture (no keys) is a *different mount*, not a branch
 * scattered through the codebase.
 *
 * Worth stating plainly: there is no password field and no server-side
 * sign-in route anywhere in this app. Clerk's hosted components collect the
 * credential; the API only ever verifies a token. A backend route that minted a
 * session from a user id would be an account-takeover primitive, which is why
 * the previous stack removed one and this stack never had one.
 */

function SessionBridge() {
  const { getToken, isLoaded, isSignedIn, userId, signOut } = useAuth();

  useEffect(() => {
    setSession(
      createClerkSession({
        getToken: () => getToken(),
        isReady: () => isLoaded,
        userId: () => userId ?? null,
        signOut: () => signOut(),
      }),
    );
  }, [getToken, isLoaded, isSignedIn, signOut, userId]);

  return null;
}

export default function ClerkBridge({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <SessionBridge />
      {children}
    </ClerkProvider>
  );
}

/**
 * The account control for a page header. Rendered only when Clerk is mounted,
 * because a sign-in button that cannot sign anyone in is worse than none.
 */
export function AccountControl() {
  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal">
        <button
          type="button"
          className="cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          Sign in
        </button>
      </SignInButton>
      {/* Clerk v6 dropped `afterSignOutUrl`; the default return to the app root is what we want. */}
      <UserButton />
    </div>
  );
}
