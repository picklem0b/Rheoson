'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LogoMark, Rising } from '@/components/auth/AuthVisual';
import { DEV_IDENTITIES, isSignedInDev, signInDev } from '@/lib/devAuth';
import { usePopupStore } from '@/store/popup.store';

/**
 * Login — "Hey, welcome back", with the field-first layout of the reference.
 *
 * Two honest paths:
 *
 * * **Clerk configured** — this route redirects to Clerk's hosted sign-in,
 *   which the bridge renders. A homemade password form is not built here
 *   *on purpose*: Clerk's Backend API can mint a session from a user id
 *   without checking a password, so any self-rolled `/login` proxy is an
 *   account-takeover primitive. The current stack removed that route; this
 *   one does not reintroduce it.
 * * **Dev posture** — the allow-listed identity picker. This is the posture
 *   the whole repo runs in without keys.
 */
export default function LoginPage() {
  const router = useRouter();
  const [clerkOn, setClerkOn] = useState(false);
  const [checking, setChecking] = useState(true);
  const openPopup = usePopupStore((state) => state.open);

  useEffect(() => {
    // Redirecting after the first paint avoids a flash for the dev posture,
    // which is the common case in this repo.
    if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      router.replace('/sign-in');
      return;
    }
    // The state change belongs to the task queue, not the effect's sync pass.
    const task = setTimeout(() => setChecking(false), 0);
    return () => clearTimeout(task);
  }, [router]);

  const choose = (userId: string, name: string) => {
    signInDev(userId);
    void fetch('/api/me', { headers: { 'X-Dev-User': userId } })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        router.replace('/home');
      })
      .catch(() => {
        // The server is the security boundary; if it refuses, the local
        // flag is a lie and gets removed before it misleads anyone.
        openPopup({
          kind: 'error',
          title: 'Could not sign in',
          detail: 'The server did not accept this identity. Is the API running?',
        });
        import('@/lib/devAuth').then((mod) => mod.signOutDev());
      });
  };

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
            Hey,
            <br />
            welcome back
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Sign in to reach your library, queues and downloads — everything
            this server holds for you.
          </p>
        </Rising>

        <Rising delay={140} className="flex flex-col gap-3">
          {isSignedInDev() ? (
            <p className="eyebrow">You have a session on this device</p>
          ) : null}
          {DEV_IDENTITIES.map((identity) => (
            <button
              key={identity.id}
              type="button"
              onClick={() => choose(identity.id, identity.name)}
              className="brut-btn w-full items-start justify-start px-4 py-3.5 text-left"
            >
              <span className="flex flex-col">
                <span className="text-sm font-extrabold">Continue as {identity.name}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {identity.blurb}
                </span>
              </span>
            </button>
          ))}

          <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Development posture: identities are allow-listed by the server, and
            no password is checked anywhere. Production sign-in is Clerk&apos;s.
          </p>
        </Rising>
      </main>

      <footer className="mx-auto flex w-full max-w-sm items-center gap-1 pb-8 pt-6 text-sm">
        <span style={{ color: 'var(--text-secondary)' }}>New here?</span>
        <Link href="/register" className="font-bold" style={{ color: 'var(--accent-bright)' }}>
          Create an account
        </Link>
      </footer>
    </div>
  );
}
