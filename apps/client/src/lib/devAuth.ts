'use client';

/**
 * Dev sign-in — the no-Clerk posture's own flow.
 *
 * This is a **development convenience, not a security boundary**: the server's
 * dev posture accepts only the allow-listed identities, and the browser just
 * records which one is speaking. Production uses Clerk end to end and never
 * touches this file; `clerkConfigured()` decides which world a build is in.
 */

const USER_KEY = 'rheoson-dev-user';
const SIGNED_IN_KEY = 'rheoson-signed-in';

export const DEV_IDENTITIES = [
  { id: 'dev_user_a', name: 'Ada', blurb: 'The primary library' },
  { id: 'dev_user_b', name: 'Beto', blurb: 'The second listener' },
] as const;

export function isSignedInDev(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIGNED_IN_KEY) === '1';
}

export function signInDev(userId: string): void {
  window.localStorage.setItem(USER_KEY, userId);
  window.localStorage.setItem(SIGNED_IN_KEY, '1');
}

export function signOutDev(): void {
  window.localStorage.removeItem(SIGNED_IN_KEY);
}
