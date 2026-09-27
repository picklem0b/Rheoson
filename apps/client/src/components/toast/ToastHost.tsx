'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useToastStore, type Toast } from '@/store/toast.store';

/**
 * ToastHost — the single renderer for every toast.
 *
 * Visual rules, all taken from the design tokens rather than the Tailwind
 * palette (never raw colours — the tokens are what make a light theme work):
 *
 * * **pass** — `--success` accent, a check, auto-dismisses.
 * * **fail** — `--danger` accent, a warning mark, the `[ERROR_CODE: …]` chip,
 *   and an ⓘ button that reveals the untruncated reason. It stays until the
 *   user dismisses it.
 * * **info** — a neutral surface, no accent.
 *
 * The ⓘ control is a real disclosure: `aria-expanded`, `aria-controls`, a
 * labelled panel, and Escape closes it. Nothing here is hover-only, because
 * the device this app is built for does not have a pointer.
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
  if (kind === 'error') {
    return (
      <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true">
        <circle cx="128" cy="128" r="104" fill="none" stroke="currentColor" strokeWidth="18" />
        <rect x="119" y="68" width="18" height="80" rx="9" fill="currentColor" />
        <circle cx="128" cy="178" r="11" fill="currentColor" />
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

function InfoToggle({
  open,
  onClick,
  label,
  panelId,
  buttonRef,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  panelId: string;
  buttonRef: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={label}
      onClick={onClick}
      className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full transition-opacity active:opacity-60"
      style={{
        border: '1px solid var(--border-strong)',
        color: 'var(--text-secondary)',
        background: open ? 'var(--accent-subtle)' : 'transparent',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 256 256" aria-hidden="true">
        <circle cx="128" cy="128" r="104" fill="none" stroke="currentColor" strokeWidth="20" />
        <rect x="119" y="112" width="18" height="72" rx="9" fill="currentColor" />
        <circle cx="128" cy="78" r="12" fill="currentColor" />
      </svg>
    </button>
  );
}

function accentFor(kind: Toast['kind']): string {
  if (kind === 'success') return 'var(--success)';
  if (kind === 'error') return 'var(--danger)';
  return 'var(--text-secondary)';
}

function ToastCard({ toast: item }: { toast: Toast }) {
  const [open, setOpen] = useState(false);
  const dismiss = useToastStore((state) => state.dismiss);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const accent = accentFor(item.kind);
  const hasDetail = Boolean(item.detail || item.code);

  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      aria-live={item.kind === 'error' ? 'assertive' : 'polite'}
      className="pointer-events-auto w-[min(92vw,26rem)] rounded-[14px] p-3.5 shadow-lg"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${item.kind === 'info' ? 'var(--border)' : 'var(--border-strong)'}`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" style={{ color: accent }}>
          <Icon kind={item.kind} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {item.title}
          </p>
          {item.message ? (
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {item.message}
            </p>
          ) : null}

          {item.code ? (
            <p
              className="mt-1.5 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide"
              style={{
                background: item.kind === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
                color: item.kind === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
              }}
            >
              ERROR_CODE: {item.code}
            </p>
          ) : null}

          {open && hasDetail ? (
            <div
              id={panelId}
              className="mt-2 rounded-[10px] p-2.5 text-xs leading-relaxed"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {item.detail ? <p className="font-mono break-words">{item.detail}</p> : null}
              {item.code ? (
                <p className="mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Trace code {item.code} to find the exact failure in the engine.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {hasDetail ? (
            <InfoToggle
              buttonRef={toggleRef}
              open={open}
              onClick={() => setOpen((value) => !value)}
              panelId={panelId}
              label={open ? `Hide details for ${item.title}` : `Show details for ${item.title}`}
            />
          ) : null}
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
