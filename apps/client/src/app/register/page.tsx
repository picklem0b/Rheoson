'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LogoMark, Rising } from '@/components/auth/AuthVisual';
import { DEV_IDENTITIES, signInDev } from '@/lib/devAuth';

/**
 * Register — the "create an account" half of the front door.
 *
 * Same two honest paths as login: Clerk owns production account creation
 * (hosted, verified), and the dev posture — which has no accounts to create —
 * says exactly that and offers the identities the server allow-lists. There
 * is deliberately no fake form to fill: a register screen that accepts a
 * password but stores nothing would be a lie with a submit button.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [clerkOn, setClerkOn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      router.replace('/sign-up');
      return;
    }
    // The state change belongs to the task queue, not the effect's sync pass.
    const task = setTimeout(() => setChecking(false), 0);
    return () => clearTimeout(task);
  }, [router]);

  if (clerkOn || checking) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ background: 'var(--bg-base)' }}>
        <LogoMark size={56} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col px-6" style={{ background: 'var(--bg-base)', paddingTop: 'var(--safe-area-top)' }}>
      <header className="pt-4">
        <Link href="/welcome" aria-label="Back to welcome" className="brut-btn size-10 !p-0 text-base">
          ←
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 pt-10">
        <Rising>
          <LogoMark size={56} />
        </Rising>
        <Rising delay={70}>
          <h1 className="display text-4xl" style={{ color: 'var(--text-primary)' }}>
            Join
            <br />
            Rheoson
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Accounts live on this server. In production, Clerk runs sign-up with
            verified emails — this development posture skips account creation
            and uses its two allow-listed identities instead.
          </p>
        </Rising>

        <Rising delay={140} className="flex flex-col gap-3">
          {DEV_IDENTITIES.map((identity) => (
            <button
              key={identity.id}
              type="button"
              onClick={() => {
                signInDev(identity.id);
                router.replace('/home');
              }}
              className="brut-btn w-full items-start justify-start px-4 py-3.5 text-left"
            >
              <span className="flex flex-col">
                <span className="text-sm font-extrabold">Start as {identity.name}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {identity.blurb}
                </span>
              </span>
            </button>
          ))}
        </Rising>
      </main>

      <footer className="mx-auto flex w-full max-w-sm items-center gap-1 pb-8 pt-6 text-sm">
        <span style={{ color: 'var(--text-secondary)' }}>Already have one?</span>
        <Link href="/login" className="font-bold" style={{ color: 'var(--accent-bright)' }}>
          Sign in
        </Link>
      </footer>
    </div>
  );
}
