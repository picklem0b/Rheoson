import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import PopupHost from '@/components/popup/PopupHost';
import { definePopupKind, popup, popupKindNames, usePopupStore } from '@/store/popup.store';

/**
 * The popup registry's contract — the flexibility promise:
 *
 * * a feature module defines its own kind once and raises it everywhere;
 * * kind defaults apply, per-call specs override, the host stays dumb;
 * * an unregistered kind is a programming error that fails loudly;
 * * a popup body can be any ReactNode, and a popup can refuse dismissal.
 */

beforeEach(() => {
  usePopupStore.getState().close();
});

afterEach(() => {
  usePopupStore.getState().close();
});

describe('definePopupKind', () => {
  it('registers a kind whose defaults apply when shown', () => {
    definePopupKind('sync-conflict', {
      tone: 'warning',
      detail: 'The server and this device disagree.',
    });

    popup.show('sync-conflict', { title: 'Preferences conflict' });

    const state = usePopupStore.getState().popup;
    expect(state?.kind).toBe('sync-conflict');
    expect(state?.tone).toBe('warning');
    expect(state?.detail).toBe('The server and this device disagree.');
  });

  it('lets the call override any default', () => {
    definePopupKind('sync-conflict', { tone: 'warning' });

    popup.show('sync-conflict', { title: 'Preferences conflict', detail: 'custom body', tone: 'danger' });

    expect(usePopupStore.getState().popup?.tone).toBe('danger');
    expect(usePopupStore.getState().popup?.detail).toBe('custom body');
  });

  it('merges re-registration instead of clobbering', () => {
    definePopupKind('hint', { tone: 'neutral' });
    definePopupKind('hint', { duration: 6 });

    popup.show('hint', { title: 'A hint' });

    const state = usePopupStore.getState().popup;
    expect(state?.tone).toBe('neutral');
    expect(state?.duration).toBe(6);
  });

  it('lists registered kinds', () => {
    expect(popupKindNames()).toContain('error');
    expect(popupKindNames()).toContain('confirm');
  });

  it('throws on an unregistered kind — fail loudly, never render a lie', () => {
    expect(() => popup.show('no-such-kind', { title: 'x' })).toThrow(/not registered/);
  });

  it('rejects malformed kind names', () => {
    expect(() => definePopupKind('', { tone: 'neutral' })).toThrow();
    expect(() => definePopupKind('has spaces', { tone: 'neutral' })).toThrow();
  });
});

describe('custom popup bodies and lifetime', () => {
  it('renders a ReactNode body and the caller\u2019s own icon', () => {
    popup.open({
      title: 'Storage almost full',
      tone: 'warning',
      icon: <strong data-testid="custom-icon">⚠</strong>,
      detail: (
        <div data-testid="custom-body">
          3.2 GB of 4 GB used. <a href="/downloads">Manage downloads</a>
        </div>
      ),
    });
    render(<PopupHost />);

    expect(screen.getByTestId('custom-icon')).toBeTruthy();
    expect(screen.getByTestId('custom-body').textContent).toContain('Manage downloads');
  });

  it('refuses Escape and backdrop dismissal when dismissable is false', () => {
    popup.open({ title: 'Choose one', dismissable: false, actions: [{ label: 'Stay', onClick: () => undefined }] });
    render(<PopupHost />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(usePopupStore.getState().popup).not.toBeNull();

    fireEvent.click(screen.getByTestId('popup-backdrop'));
    expect(usePopupStore.getState().popup).not.toBeNull();

    // The dialog's own buttons remain the way out.
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(usePopupStore.getState().popup).not.toBeNull(); // handler owns closing
    popup.close();
    expect(usePopupStore.getState().popup).toBeNull();
  });

  it('carries the kind on the DOM node for styling and tests', () => {
    definePopupKind('download-finished', { tone: 'success' });
    popup.show('download-finished', { title: 'Saved to your library' });
    render(<PopupHost />);

    expect(screen.getByTestId('popup').getAttribute('data-kind')).toBe('download-finished');
  });
});
