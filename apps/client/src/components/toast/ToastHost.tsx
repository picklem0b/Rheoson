'use client';

import { useToastStore, type Toast } from '@/store/toast.store';

/**
 * ToastHost — the single renderer for every toast.
 *
 * Toasts are the quiet voice: success (a completion) and info (a note).
 * Failures are popups — they render in `PopupHost`, and the store makes an
 * error toast unwritable. Visual rules, all taken from the design tokens
 * rather than the Tailwind palette (never raw colours — the tokens are what
 * make a light theme work):
 *
 * * **pass** — `--success` accent, a check, auto-dismisses.
 * * **info** — a neutral surface, no accent.
 */

function Icon({ kind }: { kind: Toast['kind'] }) {
  if (kind === 'success') {
    return (
      <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true">
        <circle cx="128" cy="128" r="104" fill="none" stroke="currentColor" strokeWidth="18" />
        <path d="M82 132l30 30 62-66" fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true">
      <circle cx="128" cy="128" r="104" fill="none" stroke="currentColor" strokeWidth="18" />
      <rect x="119" y="112" width="18" height="76" rx="9" fill="currentColor" />
      <circle cx="128" cy="80" r="11" fill="currentColor" />
    </svg>
  );
}

function accentFor(kind: Toast['kind']): string {
  if (kind === 'success') return 'var(--success)';
  return 'var(--text-secondary)';
}

function ToastCard({ toast: item }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const accent = accentFor(item.kind);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto w-[min(92vw,26rem)] p-3.5"
      style={{
        background: 'var(--bg-elevated)',
        border: '2px solid var(--border-strong)',
        borderRadius: 'var(--radius-brut)',
        boxShadow: 'var(--hard-shadow-sm)',
        borderLeft: `6px solid ${accent}`,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" style={{ color: accent }}>
          <Icon kind={item.kind} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {item.title}
          </p>
          {item.message ? (
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {item.message}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => dismiss(item.id)}
          className="grid size-6 cursor-pointer place-items-center rounded-full transition-opacity active:opacity-60"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="12" height="12" viewBox="0 0 256 256" aria-hidden="true">
            <path d="M64 64l128 128M192 64L64 192" stroke="currentColor" strokeWidth="22" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col-reverse items-center gap-2 px-4"
      style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 5.5rem)' }}
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} toast={item} />
      ))}
    </div>
  );
}
