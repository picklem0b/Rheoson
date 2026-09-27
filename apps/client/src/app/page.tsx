/**
 * M0 home — a shell, not a landing page. Proves the token system,
 * typography and accent styling render end to end. The full app surface
 * arrives in M2 (playback) — tracked in docs/migration/04-plan.md.
 */
import Link from 'next/link';

export default function Home() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-3 text-center"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="grid size-16 place-items-center rounded-2xl text-2xl font-bold"
        style={{ background: 'var(--accent)', color: 'rgb(255 255 255)' }}
        aria-hidden="true"
      >
        R
      </div>
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        Rheoson Next
      </h1>
      <p className="max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>
        Skeleton milestone — design tokens, error pages and the API core are
        live. Playback arrives with M1.
      </p>
      <Link
        href="/error/404"
        className="mt-4 rounded-full px-5 py-2.5 text-sm font-medium"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        View the error system
      </Link>
    </main>
  );
}
