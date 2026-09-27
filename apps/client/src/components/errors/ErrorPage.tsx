'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { errorPageFor } from '@/lib/errorPages';

/**
 * ErrorPage — the one visual treatment for every error state.
 *
 * Minimal by design: an "ERROR PAGE" eyebrow, the big code, the short
 * label, and an info (ⓘ) toggle that reveals a panel with the specific
 * title/subtitle for this error. The longer copy is never shown by
 * default. Works with mouse, keyboard (Enter/Space) and touch; the panel
 * is a labelled dialog region, closes on Escape / backdrop / toggle, and
 * never blocks navigation.
 *
 * `code`/`message` carry the DCCNN chip when the failure came from the
 * API — the same wire format the toasts show.
 */

interface ErrorPageProps {
  status?: number | null;
  /** DCCNN chip from the wire format, e.g. `MVA01` — shown in the panel. */
  code?: string | null;
  /** Extra wire detail, if the server sent one. */
  detail?: string | null;
}

export default function ErrorPage({ status, code = null, detail = null }: ErrorPageProps) {
  const router = useRouter();
  const page = errorPageFor(status);

  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [showCode, setShowCode] = useState(false);

  // Escape closes the panel; focus returns to the toggle.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      <p
        className="text-xs font-medium tracking-[0.3em] uppercase"
        style={{ color: 'var(--text-secondary)' }}
      >
        Error Page
      </p>

      <h1
        className="mt-4 text-[96px] leading-none font-bold tabular-nums sm:text-[128px]"
        aria-label={`Error ${page.status}`}
      >
        {page.status}
      </h1>

      <div className="mt-3 flex items-center gap-2">
        <p
          className="text-sm font-semibold tracking-[0.25em] uppercase"
          style={{ color: 'var(--text-secondary)' }}
        >
          {page.label}
        </p>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="error-info-panel"
          aria-label={`About error ${page.status}: ${page.title}`}
          onClick={() => setOpen((v) => !v)}
          className="grid size-7 cursor-pointer place-items-center rounded-full transition-opacity"
          style={{
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
            background: open ? 'var(--accent-subtle)' : 'transparent',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 256 256" aria-hidden="true">
            <circle cx="128" cy="128" r="104" fill="none" stroke="currentColor" strokeWidth="16" />
            <rect x="120" y="112" width="16" height="64" rx="8" fill="currentColor" />
            <circle cx="128" cy="84" r="12" fill="currentColor" />
          </svg>
        </button>
      </div>

      {code ? (
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          className="mt-4 rounded-full px-3 py-1 text-xs font-mono transition-colors"
          style={{
            background: 'var(--accent-subtle)',
            color: 'var(--accent-bright)',
            border: '1px solid var(--accent-border)',
          }}
          aria-label={`Error code ${code}. Activate to ${showCode ? 'hide' : 'show'} details`}
        >
          {showCode ? code : '[ERROR_CODE: …]'}
        </button>
      ) : null}

      <div
        id="error-info-panel"
        ref={panelRef}
        role="dialog"
        aria-label={`About error ${page.status}`}
        hidden={!open}
        className="mt-8 w-full max-w-sm rounded-2xl p-5 text-left"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
        }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {page.title}
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {page.subtitle}
        </p>
        {detail ? (
          <p className="mt-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {detail}
          </p>
        ) : null}
        {code && showCode ? (
          <p className="mt-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            Trace code: {code} — look it up in docs/ERROR_CODES.md to find the exact raise site.
          </p>
        ) : null}
      </div>

      <div className="mt-10 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full px-5 py-2.5 text-sm font-medium transition-opacity active:opacity-70"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          Go back
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="rounded-full px-5 py-2.5 text-sm font-medium transition-opacity active:opacity-70"
          style={{ background: 'var(--accent)', color: 'rgb(255 255 255)' }}
        >
          Home
        </button>
      </div>
    </main>
  );
}
