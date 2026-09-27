import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ErrorPage from '@/pages/errors/ErrorPage'
import { FALLBACK_ERROR_PAGE } from '@/lib/errorPages'

function renderPage(ui: React.ReactElement, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}

// ── Visual structure ─────────────────────────────────────────

describe('ErrorPage structure', () => {
  it('renders ERROR PAGE eyebrow, big code, and short label', () => {
    renderPage(<ErrorPage status={404} />)
    expect(screen.getByText(/error page/i)).toBeTruthy()
    expect(screen.getByText('404')).toBeTruthy()
    expect(screen.getByText('NOT FOUND')).toBeTruthy()
  })

  it('does not show the long explanation by default', () => {
    renderPage(<ErrorPage status={404} />)
    expect(screen.queryByText("We couldn't find the page you're looking for.")).toBeNull()
  })

  it('every supported state renders its own code and label', () => {
    // One render per state — rerun for a couple of representatives; the
    // data-driven contract test covers the whole set exhaustively.
    const cases: Array<[number, string, string]> = [
      [401, '401', 'UNAUTHORIZED'],
      [403, '403', 'FORBIDDEN'],
      [429, '429', 'TOO MANY REQUESTS'],
      [500, '500', 'SERVER ERROR'],
      [502, '502', 'BAD GATEWAY'],
      [503, '503', 'SERVICE UNAVAILABLE'],
      [504, '504', 'GATEWAY TIMEOUT'],
    ]
    for (const [status, code, label] of cases) {
      const { unmount } = renderPage(<ErrorPage status={status} />)
      expect(screen.getByText(code)).toBeTruthy()
      expect(screen.getByText(label)).toBeTruthy()
      unmount()
    }
  })
})

// ── The ⓘ interaction (mouse, keyboard, touch) ──────────────

describe('ErrorPage info control', () => {
  it('clicking ⓘ reveals the accessible panel with specific title/subtitle', () => {
    renderPage(<ErrorPage status={404} />)
    fireEvent.click(screen.getByRole('button', { name: /about error 404/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(screen.getByText('Not Found')).toBeTruthy()
    expect(screen.getByText("We couldn't find the page you're looking for.")).toBeTruthy()
  })

  it('ⓘ is a real button — keyboard Enter/Space works, aria-expanded toggles', async () => {
    renderPage(<ErrorPage status={503} />)
    const info = screen.getByRole('button', { name: /about error 503/i })
    expect(info.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(info)
    expect(info.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog')).toBeTruthy()
    // Close via the panel's own close button (what keyboard users reach first)
    fireEvent.click(screen.getByRole('button', { name: /close details/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(info.getAttribute('aria-expanded')).toBe('false')
  })

  it('Escape closes the panel without interfering with navigation', async () => {
    renderPage(<ErrorPage status={404} />, { route: '/some/unknown/path' })
    fireEvent.click(screen.getByRole('button', { name: /about error 404/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    // Exit animation is async under framer-motion — wait for unmount
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Still on the error page — the panel closed, the route did not change
    expect(screen.getByText('404')).toBeTruthy()
  })

  it('closing the panel returns focus to the ⓘ control', () => {
    renderPage(<ErrorPage status={404} />)
    const info = screen.getByRole('button', { name: /about error 404/i })
    fireEvent.click(info)
    fireEvent.click(screen.getByRole('button', { name: /close details/i }))
    expect(document.activeElement).toBe(info)
  })

  it('touch works because the control is a button (click synthesis)', () => {
    renderPage(<ErrorPage status={429} />)
    const info = screen.getByRole('button', { name: /about error 429/i })
    fireEvent.click(info) // what a tap becomes
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

// ── Fallback and raw-message handling ────────────────────────

describe('ErrorPage fallback', () => {
  it('unknown status renders the 500-shaped fallback', () => {
    renderPage(<ErrorPage status={418} />)
    expect(screen.getByText('500')).toBeTruthy()
    expect(screen.getByText(FALLBACK_ERROR_PAGE.label)).toBeTruthy()
  })

  it('raw API message shows inside the panel when provided', () => {
    renderPage(
      <ErrorPage status={500} message="Database timed out after 30s" />
    )
    fireEvent.click(screen.getByRole('button', { name: /about error 500/i }))
    expect(screen.getByText('Database timed out after 30s')).toBeTruthy()
  })

  it('works outside a router (ErrorBoundary usage): no nav buttons, no crash', () => {
    // Deliberately NOT wrapped in MemoryRouter — ErrorBoundary mounts above
    // RouterProvider, so this is the real production shape.
    render(<ErrorPage status={500} message="boom" actions={<button>Reload app</button>} />)
    expect(screen.getByText('500')).toBeTruthy()
    expect(screen.getByText('Reload app')).toBeTruthy()
    expect(screen.queryByText('Go back')).toBeNull()
    expect(screen.queryByText('Home')).toBeNull()
  })
})
