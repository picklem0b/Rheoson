import type { ApiError } from '@/api/client.api'
import { splitErrorCode } from '@/api/client.api'

/**
 * Fatal 5xx navigation.
 *
 * An unhandled server failure deserves the error page, not a toast that
 * evaporates in 6 seconds. The API client calls `reportFatalApiError` for
 * every ≥500 response it does not retry through; this module navigates to
 * `/error` with `{ status, message, code }` in router state.
 *
 * Out of scope, deliberately:
 *  - 4xx (client errors) — surfaces toast their own failures; a redirect
 *    would be disorienting.
 *  - callers that pass `{ _noFatalRedirect: true }` (Doctor probes, the
 *    health poller, session validation) — their whole job is probing a
 *    failing backend, so they present the failure inline.
 *  - status 0 ("Cannot reach the API server") — the NetworkErrorBanner owns
 *    that surface (with the wake-up polling that makes recovery visible).
 *
 * router.state carries the failure; ErrorRedirect reads it. The router is
 * resolved lazily — lib/ sits below the router in the import graph, and the
 * module must stay importable (no-op) outside a Router context, which the
 * tests rely on.
 */

/** Raising it once is a message; repeating it is a loop. */
let _navigating = false

export function resetFatalErrorNav(): void {
  _navigating = false
}

export interface FatalApiErrorInfo {
  status: number
  message?: string
  code?: string
}

export function reportFatalApiError(err: ApiError): void {
  const status = err?.status ?? 0
  if (status < 500) return

  if (_navigating) return
  _navigating = true

  // The API client prefers the structured `code` field and strips the
  // suffix from the message it attaches — so err.code is authoritative;
  // splitting the detail only matters for errors built elsewhere.
  const { code } = splitErrorCode(err?.detail ?? '')
  const message = (err?.detail ?? '').trim() || undefined
  const resolvedCode = err?.code ?? code

  // `replace: true` — the failed screen is not a destination to go back to;
  // history keeps "Go back" on the error page pointing at the last healthy
  // screen.
  void navigateToError({ status, message, code: resolvedCode })
}

function navigateToError(info: FatalApiErrorInfo): void {
  // react-router's createBrowserRouter exposes the live instance for exactly
  // this: navigating from outside React (interceptors, workers, libs).
  // Undefined or throws outside a router → drop the event; ErrorBoundary
  // and the banner still cover those worlds.
  const router = (globalThis as { __rheosonRouter?: { navigate: (p: string, o: { replace: boolean; state: unknown }) => void } }).__rheosonRouter
  if (!router) {
    _navigating = false
    return
  }
  try {
    router.navigate('/error', { replace: true, state: info })
  } catch {
    _navigating = false
  }
}
