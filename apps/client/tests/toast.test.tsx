import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import ToastHost from '@/components/toast/ToastHost';
import { toast, useToastStore } from '@/store/toast.store';

/**
 * Toasts carry the promise this app makes about failures: a red toast always
 * names a code, and the ⓘ control always reveals the reason behind it. Both are
 * asserted here rather than left to convention.
 */

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('toast store', () => {
  it('creates a success toast with no code', () => {
    toast.success('Download complete', 'Album — artist');

    const [item] = useToastStore.getState().toasts;
    expect(item.kind).toBe('success');
    expect(item.title).toBe('Download complete');
    expect(item.code).toBeUndefined();
    expect(item.duration).toBeGreaterThan(0);
  });

  it('keeps an error on screen until it is dismissed', () => {
    toast.error({ title: 'Download failed', code: 'DEX01', detail: 'YouTube refused this track' });

    const [item] = useToastStore.getState().toasts;
    expect(item.kind).toBe('error');
    // A failure the user never saw is a failure they report as "it doesn't work".
    expect(item.duration).toBe(0);
  });

  it('labels an uncoded error instead of pretending it is ordinary', () => {
    toast.error({ title: 'Something failed' });

    expect(useToastStore.getState().toasts[0].code).toBe('UNCODED');
  });

  it('caps the stack so a burst cannot bury the newest failure', () => {
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

describe('ToastHost', () => {
  it('renders a pass toast in the success accent without a code chip', () => {
    toast.success('Download complete', 'Song — artist');
    render(<ToastHost />);

    const card = screen.getByRole('status');
    expect(card.textContent).toContain('Download complete');
    expect(card.textContent).not.toContain('ERROR_CODE');
  });

  it('renders a fail toast with the code chip and the reason behind ⓘ', () => {
    toast.error({
      title: 'Download failed',
      code: 'DEX01',
      detail: 'YouTube refused this track on every client',
      message: 'Fake Song',
    });
    render(<ToastHost />);

    const card = screen.getByRole('alert');
    expect(card.textContent).toContain('ERROR_CODE: DEX01');
    // The detail is hidden by default — that is the whole point of the control.
    expect(card.textContent).not.toContain('refused this track');

    const toggle = screen.getByRole('button', { name: /show details/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(screen.getByRole('alert').textContent).toContain('YouTube refused this track on every client');
    expect(screen.getByRole('button', { name: /hide details/i }).getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the details panel on Escape', () => {
    toast.error({ title: 'Failed', code: 'DEX01', detail: 'the reason' });
    render(<ToastHost />);

    fireEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByRole('alert').textContent).toContain('the reason');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('alert').textContent).not.toContain('the reason');
  });

  it('dismisses a toast from its close button', () => {
    toast.info('A note');
    render(<ToastHost />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText('A note')).toBeNull();
  });

  it('asks for details on a coded toast even when no detail text is present', () => {
    toast.error({ title: 'Failed', code: 'DEX01' });
    render(<ToastHost />);

    // The code alone is worth revealing: it is the traceable identifier.
    expect(screen.getByRole('button', { name: /show details/i })).toBeTruthy();
  });
});
