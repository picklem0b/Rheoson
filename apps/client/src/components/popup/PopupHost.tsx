'use client';

import { useEffect, useCallback, useRef, type ReactNode } from 'react';

import { usePopupStore, type PopupTone } from '@/store/popup.store';

/**
 * PopupHost — the one place a popup is drawn, whatever its kind.
 *
 * The host knows the *shape* (dialog, backdrop, focus trap, code chip) and
 * nothing about *which* popups exist: kinds come from the store's registry,
 * and a kind's tone/icon/body render here without the host naming them.
 * Adding a new popup kind is a `definePopupKind` call — this file never
 * changes.
 *
 * Accessibility contract:
 *
 * * `role="alertdialog"` for interrupting popups (danger/warning tones) and
 *   `role="dialog"` otherwise, with labelled/described-by wiring;
 * * focus moves into the dialog on open and returns to the trigger on close;
 * * Tab cycles inside the dialog (a real focus trap, four lines of it);
 * * Escape and backdrop-click close — unless the popup declared itself
 *   `dismissable: false`, in which case its buttons are the only way out;
 * * the dialog stops propagation so a mis-tap inside never closes it.
 */

const TONE_COLOR: Record<PopupTone, string> = {
  danger: 'var(--danger)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  neutral: 'var(--text-secondary)',
};

function DefaultGlyph({ tone }: { tone: PopupTone }) {
  if (tone === 'danger' || tone === 'warning') {
    return <span aria-hidden="true">!</span>;
  }
  if (tone === 'success') {
    return <span aria-hidden="true">✓</span>;
  }
  if (tone === 'accent') {
    return <span aria-hidden="true">?</span>;
  }
  return <span aria-hidden="true">i</span>;
}

function CodeChip({ code, tone }: { code: string; tone: PopupTone }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1.5px solid ${color}`,
        color,
      }}
    >
      ERROR_CODE: {code}
    </span>
  );
}

export default function PopupHost() {
  const popupState = usePopupStore((state) => state.popup);
  const close = usePopupStore((state) => state.close);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (!popupState) return;
      if (event.key === 'Escape') {
        // A popup that declared itself non-dismissable owns its exit: Escape
        // must not silently drop a choice the user has not made yet.
        if (!popupState.dismissable) return;
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [popupState, close],
  );

  useEffect(() => {
    if (!popupState) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKey, true);
    // Focus after paint, so the dialog exists when focus arrives.
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    });
    const timer = popupState.duration > 0 ? window.setTimeout(close, popupState.duration * 1000) : undefined;
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
      restoreFocusRef.current?.focus?.();
    };
  }, [popupState, handleKey, close]);

  if (!popupState) return null;

  const interrupting = popupState.tone === 'danger' || popupState.tone === 'warning';
  const toneColor = TONE_COLOR[popupState.tone];

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: 'rgb(var(--gray-950) / 0.62)' }}
      onClick={popupState.dismissable ? close : undefined}
      data-testid="popup-backdrop"
    >
      <div
        ref={dialogRef}
        role={interrupting ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="popup-title"
        aria-describedby={popupState.detail ? 'popup-detail' : undefined}
        className="brut-panel w-full max-w-sm p-5"
        style={{ background: 'var(--bg-surface)' }}
        onClick={(event) => event.stopPropagation()}
        data-testid="popup"
        data-kind={popupState.kind}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-[8px] text-sm font-black"
              style={{ background: toneColor, color: 'var(--bg-base)' }}
              aria-hidden="true"
            >
              {popupState.icon ?? <DefaultGlyph tone={popupState.tone} />}
            </span>
            <h2 id="popup-title" className="text-base font-extrabold tracking-tight">
              {popupState.title}
            </h2>
          </div>
          {popupState.dismissable ? (
            <button
              type="button"
              onClick={close}
              aria-label="Close dialog"
              className="brut-btn size-7 shrink-0 !p-0 text-sm"
              data-variant="plain"
            >
              ✕
            </button>
          ) : null}
        </div>

        {popupState.code ? (
          <div className="mb-3">
            <CodeChip code={popupState.code} tone={popupState.tone} />
          </div>
        ) : null}

        {popupState.detail ? (
          <div id="popup-detail" className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {popupState.detail}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          {popupState.actions?.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="brut-btn px-4 py-2 text-sm"
              data-variant={action.variant === 'accent' ? 'accent' : action.variant === 'danger' ? 'plain' : 'plain'}
              style={action.variant === 'danger' ? { background: 'var(--danger)', color: 'rgb(255 255 255)', borderColor: 'var(--border-hard)' } : undefined}
            >
              {action.label}
            </button>
          ))}
          {!popupState.actions?.length && popupState.dismissable ? (
            <button type="button" onClick={close} className="brut-btn px-4 py-2 text-sm" data-variant="accent">
              Got it
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
