'use client';

/**
 * The session layer — one interface, two providers.
 *
 * The API verifies a **Clerk JWT on every data route** and fails closed
 * outside development. This module is the client's half of that contract, and
 * it is deliberately an interface with a swappable implementation rather than
 * a hard dependency:
 *
 * * `devSession` — sends the allow-listed `X-Dev-User` header, which the server
 *   accepts **only** in its development posture. This is what makes the app
 *   bootable with no keys, which is how it is developed and how CI runs.
 * * `clerkSession` — the production provider. Installing `@clerk/nextjs` and
 *   returning a real session token here is the whole change; no route, no
 *   store and no component needs to know which one is active.
 *
 * `sessionReady` matters: the app must not fire an authenticated request
 * before the provider has resolved, or the first paint is a 401.
 */

export interface Session {
  /** Resolves the bearer token to send, or null when signed out. */
  getToken(): Promise<string | null>;
  /** Extra headers the provider needs (the dev provider's identity header). */
  headers(): Record<string, string>;
  /** True once the provider has finished resolving for this page load. */
  isReady(): boolean;
  /** The signed-in user's id, for owner-scoped client-side decisions. */
  userId(): string | null;
  signOut(): Promise<void>;
}

const DEV_USER_KEY = 'rheoson-dev-user';
const DEV_USERS = ['dev_user_a', 'dev_user_b'] as const;
type DevUser = (typeof DEV_USERS)[number];

function readDevUser(): DevUser {
  if (typeof window === 'undefined') return DEV_USERS[0];
  const stored = window.localStorage.getItem(DEV_USER_KEY);
  return (DEV_USERS as readonly string[]).includes(stored ?? '') ? (stored as DevUser) : DEV_USERS[0];
}

/**
 * Development provider. Mirrors the server's dev posture exactly: one
 * allow-listed identity, no token, and it refuses to pretend to be production.
 */
export const devSession: Session = {
  getToken: async () => null,
  headers: () => ({ 'X-Dev-User': readDevUser() }),
  isReady: () => true,
  userId: () => readDevUser(),
  signOut: async () => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(DEV_USER_KEY);
  },
};

/** True when a Clerk publishable key is present, so production should use it. */
export function clerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/**
 * Production provider factory.
 *
 * The caller supplies Clerk's own primitives (`useAuth`) rather than this
 * module importing them, for two reasons: Clerk's hooks only exist inside a
 * provider (so the import belongs to the component that renders one), and a
 * project without keys must still typecheck and boot. Nothing else about the
 * app changes when this provider is installed — that is the point of the
 * interface.
 */
export function createClerkSession(input: {
  getToken: () => Promise<string | null>;
  isReady: () => boolean;
  userId: () => string | null;
  signOut: () => Promise<void>;
}): Session {
  return {
    getToken: input.getToken,
    // Clerk sends the session token in the Authorization header; there is no
    // extra identity header, and the dev header is deliberately absent.
    headers: () => ({}),
    isReady: input.isReady,
    userId: input.userId,
    signOut: input.signOut,
  };
}

let active: Session = devSession;

/** Install a provider. Called once by the app's provider component. */
export function setSession(session: Session): void {
  active = session;
}

export function session(): Session {
  return active;
}
