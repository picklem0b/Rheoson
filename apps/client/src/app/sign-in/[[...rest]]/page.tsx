'use client';

import { SignIn } from '@clerk/nextjs';

import { clerkConfigured } from '@/lib/session';

/**
 * `/sign-in` — the direct-navigation entry point.
 *
 * The credential form belongs to Clerk's hosted component. This page renders
 * it when a publishable key exists and otherwise says, honestly, that sign-in
 * is not configured — which is the truth in development, where the app runs on
 * the server's allow-listed dev identity. A blank or broken form here would
 * look like an outage.
 */
export default function SignInPage() {
  if (!clerkConfigured()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Clerk is not configured on this deployment, so sign-in is disabled.
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          In development the app uses the server&apos;s allow-listed dev identity instead. Set{' '}
          <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> to enable accounts.
        </p>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <SignIn routing="hash" />
    </main>
  );
}
