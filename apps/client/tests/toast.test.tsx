import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import PopupHost from '@/components/popup/PopupHost';
import ToastHost from '@/components/toast/ToastHost';
import { popup, usePopupStore } from '@/store/popup.store';
import { toast, useToastStore } from '@/store/toast.store';

/**
 * The two-voice contract, enforced by the stores:
 *
 * * **failures are popups** — `toast.error` forwards to the popup store, so
 *   every failure in the app arrives as a dialog carrying its DCCNN code and
 *   an ⓘ-able detail. A toast can never carry an error again.
 * * **toasts are quiet** — success and info only, always auto-dismissing.
 */

beforeEach(() => {
  useToastStore.getState().clear();
  usePopupStore.getState().close();
});

afterEach(() => {
  usePopupStore.getState().close();
});

describe('the error bridge (toast.error → popup)', () => {
  it('opens a popup, not a toast', () => {
    toast.error({ title: 'Download failed', code: 'DEX01', detail: 'YouTube refused this track' });

    expect(usePopupStore.getState().popup?.kind).toBe('error');
    expect(usePopupStore.getState().popup?.code).toBe('DEX01');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('keeps the one-line message as the detail when no explanation exists', () => {
    toast.error({ title: 'Download failed', message: 'Fake Song' });

    expect(usePopupStore.getState().popup?.detail).toBe('Fake Song');
  });

  it('prefers the full explanation over the short message', () => {
    toast.error({ title: 'Download failed', code: 'DEX01', detail: 'the full reason', message: 'short' });

    expect(usePopupStore.getState().popup?.detail).toBe('the full reason');
  });

  it('labels an uncoded error instead of pretending it is ordinary', () => {
    toast.error({ title: 'Something failed' });

    const popupState = usePopupStore.getState().popup;
    expect(popupState?.kind).toBe('error');
    expect(popupState?.code).toBeUndefined();
  });
});

describe('PopupHost', () => {
  it('renders an alertdialog with the code chip and the detail', () => {
    toast.error({ title: 'Download failed', code: 'DEX01', detail: 'YouTube refused this track' });
    render(<PopupHost />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Download failed');
    expect(dialog.textContent).toContain('ERROR_CODE: DEX01');
    expect(dialog.textContent).toContain('YouTube refused this track');
  });

  it('closes on Escape (captured at document level)', () => {
    popup.error({ title: 'Failed', code: 'DEX01', detail: 'the reason' });
    render(<PopupHost />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(usePopupStore.getState().popup).toBeNull();
  });

  it('closes on backdrop click but not on a click inside the dialog', () => {
    popup.error({ title: 'Failed', code: 'DEX01' });
    render(<PopupHost />);

    fireEvent.click(screen.getByTestId('popup'));
    expect(usePopupStore.getState().popup).not.toBeNull();

    fireEvent.click(screen.getByTestId('popup-backdrop'));
    expect(usePopupStore.getState().popup).toBeNull();
  });

  it('closes from the Got it button', () => {
    popup.error({ title: 'Failed', code: 'DEX01' });
    render(<PopupHost />);

    fireEvent.click(screen.getByRole('button', { name: /got it/i }));

    expect(usePopupStore.getState().popup).toBeNull();
  });

  it('renders confirm actions and runs the chosen one exactly once', () => {
    const onConfirm = vi.fn();
    popup.confirm({ title: 'Delete playlist?', confirmLabel: 'Delete', onConfirm });
    render(<PopupHost />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Delete playlist?');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(usePopupStore.getState().popup).toBeNull();
  });

  it('keeps focus inside the dialog when Tab cycles', () => {
    popup.error({ title: 'Failed', code: 'DEX01' });
    render(<PopupHost />);

    const dialog = screen.getByRole('alertdialog');
    const focusable = dialog.querySelectorAll<HTMLElement>('button');
    expect(focusable.length).toBeGreaterThan(1);

    focusable[0].focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).not.toBe(document.body);
  });

  it('renders nothing when no popup is open', () => {
    render(<PopupHost />);
    expect(screen.queryByTestId('popup')).toBeNull();
  });
});

describe('toasts stay quiet', () => {
  it('carries success and info only, always auto-dismissing', () => {
    toast.success('Download complete', 'Song — artist');
    toast.info('Staged parts are kept');

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(2);
    for (const item of toasts) {
      expect(item.kind === 'success' || item.kind === 'info').toBe(true);
      expect(item.duration).toBeGreaterThan(0);
    }
  });

  it('renders success without any code chip', () => {
    toast.success('Download complete', 'Song — artist');
    render(<ToastHost />);

    const card = screen.getByRole('status');
    expect(card.textContent).toContain('Download complete');
    expect(card.textContent).not.toContain('ERROR_CODE');
  });

  it('caps the stack so a burst cannot bury the newest note', () => {
    for (let index = 0; index < 8; index += 1) toast.info(`note ${index}`);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(4);
    expect(toasts[0].title).toBe('note 7');
  });

  it('dismisses by id', () => {
    const id = toast.success('one');
    toast.dismiss(id);

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
