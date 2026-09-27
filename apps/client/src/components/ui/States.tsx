'use client';

/**
 * Empty and Loading — the two honest states between "no data" and "data".
 *
 * They are deliberately not skeletons. A skeleton says "something is on its
 * way"; showing one for a library that is genuinely empty is a promise the app
 * cannot keep, and it is a defect this app shipped once already. `Loading`
 * carries a label so the wait is explained, and `Empty` says what would put
 * something in the space.
 */

export function Empty({ text }: { text: string }) {
  return (
    <p
      className="rounded-[14px] px-4 py-6 text-sm"
      style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-strong)', color: 'var(--text-secondary)' }}
    >
      {text}
    </p>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 py-8 text-sm" style={{ color: 'var(--text-secondary)' }} role="status">
      <span className="block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      {label}…
    </p>
  );
}

/** A page-level heading with an optional trailing note. */
export function PageHeading({ title, note }: { title: string; note?: string }) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {note ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      ) : null}
    </header>
  );
}
