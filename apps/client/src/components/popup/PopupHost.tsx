'use client';

import { useEffect, useCallback, useRef } from 'react';

import { usePopupStore } from '@/store/popup.store';

/**
 * PopupHost — the one place a popup is drawn.
 *
 * Accessibility contract:
 *
 * * `role="alertdialog"` with `aria-labelledby` / `aria-describedby`, so a
 *   screen reader announces the failure as an interruption;
 * * focus moves into the dialog on open and returns to the trigger on close;
 * * Tab cycles inside the dialog (a real focus trap, four lines of it);
 * * Escape closes — a popup that traps the keyboard is a bug, not a pattern;
 * * the backdrop is a click target to dismiss, but the dialog itself stops
 *   propagation so a mis-tap inside it never closes it.
 */

function CodeChip({ code }: { code: string }) {
  return (
    <span
      className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide"
      style={{
        background: 'var(--danger-bg)',
        border: '1.5px solid var(--danger)',
        color: 'var(--danger-text)',
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

  const isError = popupState.kind === 'error';

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: 'rgb(var(--gray-950) / 0.62)' }}
      onClick={close}
      data-testid="popup-backdrop"
    >
      <div
        ref={dialogRef}
        role={isError ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="popup-title"
        aria-describedby={popupState.detail ? 'popup-detail' : undefined}
        className="brut-panel w-full max-w-sm p-5"
        style={{ background: 'var(--bg-surface)' }}
        onClick={(event) => event.stopPropagation()}
        data-testid="popup"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isError ? (
              <span
                className="grid size-7 shrink-0 place-items-center rounded-[8px] text-sm font-black"
                style={{ background: 'var(--danger)', color: 'rgb(255 255 255)' }}
                aria-hidden="true"
              >
                !
              </span>
            ) : (
              <span
                className="grid size-7 shrink-0 place-items-center rounded-[8px] text-sm font-black"
                style={{ background: 'var(--accent)', color: 'rgb(255 255 255)' }}
                aria-hidden="true"
              >
                ?
              </span>
            )}
            <h2 id="popup-title" className="text-base font-extrabold tracking-tight">
              {popupState.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close dialog"
            className="brut-btn size-7 shrink-0 !p-0 text-sm"
            data-variant="plain"
          >
            ✕
          </button>
        </div>

        {isError && popupState.code ? (
          <div className="mb-3">
            <CodeChip code={popupState.code} />
          </div>
        ) : null}

        {popupState.detail ? (
          <p id="popup-detail" className="mb-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {popupState.detail}
          </p>
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
          {!popupState.actions?.length ? (
            <button type="button" onClick={close} className="brut-btn px-4 py-2 text-sm" data-variant="accent">
              Got it
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
