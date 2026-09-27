'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { LogoMark, Rising } from '@/components/auth/AuthVisual';

/**
 * Welcome — the front door, rebuilt for the app.
 *
 * The shape is the expense-tracker pattern the product asked for: a quiet
 * sign-in shortcut top-right, the artwork in the middle, and a dark footer
 * panel that rises with the value line and the Get Started button. What
 * replaced the illustration is the product's own visual language — a big
 * logo mark and the three-word pitch in display type.
 *
 * With a Clerk key, Get Started hands over to Clerk's hosted flows (rendered
 * inside these routes); without one, the dev posture's identity picker stands
 * in. Neither path is faked here — this screen only routes.
 */
export default function WelcomePage() {
  const router = useRouter();

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: 'var(--bg-base)' }}>
      {/* Top bar: the returning-user shortcut, top-right like the reference. */}
      <header className="flex items-center justify-end px-5" style={{ paddingTop: 'var(--safe-area-top)' }}>
        <Link
          href="/login"
          className="brut-btn px-4 py-2 text-sm"
          data-variant="ghost"
        >
          Sign in
        </Link>
      </header>

      {/* Hero: the mark and the pitch. */}
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
        <Rising>
          <LogoMark size={112} />
        </Rising>
        <Rising delay={90}>
          <h1 className="display text-[clamp(2.4rem,9vw,4.5rem)]" style={{ color: 'var(--text-primary)' }}>
            Your music.
            <br />
            Your files.
          </h1>
        </Rising>
        <Rising delay={170}>
          <p className="max-w-sm text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Stream your library, keep your downloads, and read honest errors when
            something breaks. No subscription. No ads.
          </p>
        </Rising>
      </main>

      {/* Footer panel: rises last, carries the CTA. */}
      <footer
        className="flex flex-col items-center gap-4 px-6 pb-10 pt-8"
        style={{
          background: 'var(--bg-surface)',
          borderTop: '2px solid var(--border-strong)',
        }}
      >
        <Rising delay={240} className="flex w-full max-w-sm flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/register')}
            className="brut-btn w-full px-6 py-3.5 text-base"
            data-variant="accent"
          >
            Get started
          </button>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Self-hosted · Your library lives on your machine
          </p>
        </Rising>
      </footer>
    </div>
  );
}
