import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRouter } from 'next/navigation';

import ErrorPage from '@/components/errors/ErrorPage';
import { ERROR_PAGES, FALLBACK_ERROR_PAGE, errorPageFor } from '@/lib/errorPages';

// next/navigation is not available in jsdom tests — stub the router.
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    back: vi.fn(),
    push: vi.fn(),
  })),
}));

describe('error page configuration', () => {
  it('maps every supported status and falls back to 500 for unknown ones', () => {
    expect(errorPageFor(404)).toEqual(ERROR_PAGES[404]);
    expect(errorPageFor(418)).toEqual(FALLBACK_ERROR_PAGE);
    expect(errorPageFor(undefined)).toEqual(FALLBACK_ERROR_PAGE);
    expect(errorPageFor(null)).toEqual(FALLBACK_ERROR_PAGE);
  });

  it('covers the nine shipped states with distinct, specific copy', () => {
    const statuses = Object.keys(ERROR_PAGES).map(Number);
    expect(statuses).toEqual([400, 401, 403, 404, 429, 500, 502, 503, 504]);
    const subtitles = new Set(statuses.map((s) => ERROR_PAGES[s].subtitle));
    expect(subtitles.size).toBe(statuses.length);
  });
});

describe('ErrorPage component', () => {
  it('renders the minimal surface: eyebrow, big code, label — no long copy', () => {
    render(<ErrorPage status={404} />);
    expect(screen.getByText('Error Page')).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('NOT FOUND')).toBeInTheDocument();
    // The explanation is NOT visible by default.
    expect(screen.getByText("We couldn't find the page you're looking for.")).not.toBeVisible();
  });

  it('reveals the info panel via the toggle with correct a11y wiring', () => {
    render(<ErrorPage status={403} />);
    const toggle = screen.getByRole('button', { name: /about error 403/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'error-info-panel');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('dialog', { name: /about error 403/i });
    expect(panel).toBeVisible();
    expect(screen.getByText("You can't go there.")).toBeVisible();
  });

  it('closes the panel on Escape and restores focus to the toggle', () => {
    render(<ErrorPage status={503} />);
    const toggle = screen.getByRole('button', { name: /about error 503/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('renders the DCCNN chip when a code is provided', () => {
    render(<ErrorPage status={500} code="DEX01" />);
    expect(screen.getByLabelText(/error code DEX01/i)).toBeInTheDocument();
  });

  it('renders no chip without a code', () => {
    render(<ErrorPage status={500} />);
    expect(screen.queryByLabelText(/error code/i)).not.toBeInTheDocument();
  });

  it('navigates home via the router', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ back: vi.fn(), push, replace: vi.fn() } as never);
    render(<ErrorPage status={404} />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(push).toHaveBeenCalledWith('/');
  });
});
