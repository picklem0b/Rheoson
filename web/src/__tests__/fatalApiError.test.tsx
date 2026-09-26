import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ErrorPage from '@/pages/errors/ErrorPage'
import { resetFatalErrorNav, reportFatalApiError } from '@/lib/fatalApiError'
import { api } from '@/api/client.api'

// ── ErrorPage: DCCNN code chip in the info panel ─────────────

describe('ErrorPage code chip', () => {
  it('renders the [ERR …] chip inside the info panel when a code is passed', () => {
    render(
      <MemoryRouter>
        <ErrorPage status={503} code="SSE01" />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: /about error 503/i }))
    expect(screen.getByText(/\[ERR SSE01\]/)).toBeTruthy()
  })

  it('no chip when no code is provided', () => {
    render(
      <MemoryRouter>
        <ErrorPage status={503} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: /about error 503/i }))
    expect(screen.queryByText(/\[ERR/)).toBeNull()
  })
})

// ── reportFatalApiError: the routing decision table ──────────

function installRouter(): { navigate: ReturnType<typeof vi.fn> } {
  const navigate = vi.fn()
  ;(window as { __rheosonRouter?: unknown }).__rheosonRouter = { navigate }
  return { navigate }
}

function call(path: string, opts?: Record<string, unknown>): Promise<unknown> {
  // api.get signatures vary; drive request() through the public client with
  // a stubbed fetch so the full production code path runs.
  return api.get(path, opts as never)
}

describe('reportFatalApiError routing decisions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetFatalErrorNav()
    delete (window as { __rheosonRouter?: unknown }).__rheosonRouter
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as { __rheosonRouter?: unknown }).__rheosonRouter
    resetFatalErrorNav()
    vi.useRealTimers()
  })

  it('≥500 navigates to /error with status, message and code (replace, not push)', async () => {
    const { navigate } = installRouter()
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(500, { detail: 'Database gone [ERR LDB01]' })))

    await expect(call('/playlists')).rejects.toMatchObject({ status: 500 })
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))

    const [path, opts] = navigate.mock.calls[0]
    expect(path).toBe('/error')
    expect(opts.replace).toBe(true)
    expect(opts.state).toMatchObject({ status: 500, code: 'LDB01' })
    expect(String((opts.state as { message: string }).message)).toContain('Database gone')
  })

  it('4xx never navigates — client errors stay on the page that made them', async () => {
    const { navigate } = installRouter()
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(404, { detail: 'Nope' })))

    await expect(call('/playlists/nope')).rejects.toMatchObject({ status: 404 })
    await waitFor(() => expect(navigate).not.toHaveBeenCalled())
  })

  it('status 0 (unreachable) never navigates — the banner owns that surface', () => {
    const { navigate } = installRouter()
    // Tested via the direct reporter entry (the client's network-retry path
    // would spend 3s+5s retrying a rejected fetch before surfacing status 0).
    expect(() =>
      reportFatalApiError(Object.assign(new Error('offline'), { status: 0, detail: 'Cannot reach the API server' }))
    ).not.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('_noFatalRedirect opts out even on 500 (probe callers present inline)', async () => {
    const { navigate } = installRouter()
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(500, { detail: 'boom' })))

    await expect(
      call('/settings/doctor/scan', { _noFatalRedirect: true } as never)
    ).rejects.toMatchObject({ status: 500 })
    await waitFor(() => expect(navigate).not.toHaveBeenCalled())
  })

  it('two rapid 5xx navigate once, not twice (dedupe)', async () => {
    const { navigate } = installRouter()
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(500, { detail: 'boom' })))

    const a = call('/playlists').catch(() => {})
    const b = call('/likes').catch(() => {})
    await Promise.all([a, b])
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
  })

  it('gateway 503 GET retries once silently, then navigates only if it fails again', async () => {
    vi.useFakeTimers()
    const { navigate } = installRouter()
    // First response: 503 (wake-up). Second: success. Navigate must never fire.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(503, { detail: 'waking' }))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const p = call('/trending')
    // Advance past the 1500ms wake-up retry delay
    await vi.advanceTimersByTimeAsync(1600)
    await expect(p).resolves.toMatchObject({ ok: true })
    expect(navigate).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no router installed → no crash, event dropped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(500, { detail: 'boom' })))
    await expect(call('/playlists')).rejects.toMatchObject({ status: 500 })
    // Nothing to await — just proving no unhandled rejection/throw escapes
    await new Promise((r) => setTimeout(r, 10))
  })

  it('direct reportFatalApiError call (non-fetch path) navigates too', () => {
    const { navigate } = installRouter()
    reportFatalApiError(Object.assign(new Error('x'), { status: 502, detail: 'bg down' }))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate.mock.calls[0][0]).toBe('/error')
  })
})

// ── helpers ──────────────────────────────────────────────────

function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response
}
