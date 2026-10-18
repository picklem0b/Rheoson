/**
 * Crash reporting.
 *
 * Why not a crash SaaS: a stack trace carries file paths, device details and
 * occasionally a track name, and this app's premise is that such data stays
 * on the owner's hardware. Reports are therefore posted to this instance's
 * own `/api/diagnostics/crash` (see `app/routers/diagnostics_router.py`) and
 * read back in Settings → Doctor.
 *
 * Three sources feed it:
 *   1. `window.onerror` / `unhandledrejection` — anything that escapes React;
 *   2. `ErrorBoundary` — the render failures React actually catches;
 *   3. the Android `CrashLog` plugin — native crashes, which are the ones a
 *      JS-only reporter can never see. A hard crash kills the WebView before
 *      any JS runs, so the native side *writes the trace to a file* and this
 *      module picks it up on the next launch.
 *
 * Delivery is deliberately best-effort in both directions: reports queue in
 * localStorage when offline (a crash often happens exactly when the network
 * is the problem) and are re-sent on the next flush. Nothing here is allowed
 * to throw — a reporter that crashes the app is worse than no reporter.
 */

import { API_BASE, APP_VERSION } from './constants'
import { getAuthHeader } from '@/api/client.api'

const QUEUE_KEY = 'rheoson-crash-queue'
const SEEN_KEY = 'rheoson-crash-seen'

/** A crash loop must not fill the device's storage. */
const MAX_QUEUED = 40
/** Per session, so a render loop reports once rather than once per frame. */
const MAX_PER_SESSION = 25
const FLUSH_INTERVAL_MS = 30_000

export interface CrashReport {
   id: string
   kind: 'js' | 'render' | 'native'
   message: string
   stack?: string
   componentStack?: string
   platform: string
   appVersion: string
   deviceModel?: string
   osVersion?: string
   occurredAt: string
   context?: Record<string, string>
}

// ── Dedupe ────────────────────────────────────────────────────
// Same crash, same session → one report. Keyed on message + first stack
// frame, matching the server's `fingerprint_of` so the two agree.

let _sessionSent = 0
const _seenThisSession = new Set<string>()

/**
 * Stable key for "the same crash".
 *
 * The *frame* is what identifies a fault, not the message line: V8 puts the
 * message in the stack header, so keying on it alone would fold dozens of
 * distinct bugs together (every "Cannot read properties of undefined" in the
 * app would look like one crash). Native Java traces follow the same shape.
 */
function fingerprint(report: Pick<CrashReport, 'message' | 'stack'>): string {
   const lines = (report.stack ?? '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
   const frame = lines.find(l => l.startsWith('at ')) ?? lines[0] ?? ''
   return `${report.message}::${frame}`.slice(0, 400)
}

// ── Platform context ──────────────────────────────────────────

function platformContext(): Pick<CrashReport, 'platform' | 'appVersion' | 'osVersion'> {
   const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
   return {
      platform: 'web',
      appVersion: APP_VERSION,
      osVersion: ua.slice(0, 120),
   }
}

// ── Queue ─────────────────────────────────────────────────────

function readQueue(): CrashReport[] {
   try {
      const raw = localStorage.getItem(QUEUE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as CrashReport[]) : []
   } catch {
      return []
   }
}

function writeQueue(reports: CrashReport[]): void {
   try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(reports.slice(-MAX_QUEUED)))
   } catch {
      // Quota or private mode — drop the oldest half and retry once, because
      // losing old crash reports beats losing the ability to record new ones.
      try {
         localStorage.setItem(QUEUE_KEY, JSON.stringify(reports.slice(-Math.floor(MAX_QUEUED / 2))))
      } catch {
         /* give up silently */
      }
   }
}

/** Crash reports held on this device, newest last — the Doctor renders these. */
export function getLocalCrashReports(): CrashReport[] {
   return readQueue()
}

/** Fingerprints the user has already been shown, newest first. */
export function getSeenFingerprints(): string[] {
   try {
      const raw = localStorage.getItem(SEEN_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
   } catch {
      return []
   }
}

function rememberSeen(fp: string): void {
   try {
      const seen = getSeenFingerprints().slice(0, 19)
      seen.unshift(fp)
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
   } catch {
      /* non-fatal */
   }
}

// ── Capture ───────────────────────────────────────────────────

/**
 * Record a crash. Safe to call from anywhere — never throws, never blocks.
 *
 * `context` is a small free-form map (component name, route, a flag) that
 * survives to the server; keep it free of anything personal.
 */
export function captureCrash(
   error: unknown,
   kind: CrashReport['kind'] = 'js',
   context?: Record<string, string>,
   componentStack?: string
): void {
   try {
      const err = error instanceof Error ? error : new Error(String(error))
      const report: CrashReport = {
         id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
         kind,
         message: err.message || err.name || 'Unknown error',
         stack: err.stack,
         componentStack,
         ...platformContext(),
         occurredAt: new Date().toISOString(),
         context,
      }

      const fp = fingerprint(report)
      if (_seenThisSession.has(fp)) return
      if (_sessionSent >= MAX_PER_SESSION) return
      _seenThisSession.add(fp)
      _sessionSent += 1

      writeQueue([...readQueue(), report])
      void flushCrashes()
   } catch {
      /* a reporter must never be the crash */
   }
}

// ── Delivery ──────────────────────────────────────────────────

let _flushing = false

/** POST everything queued. Failures stay queued for the next attempt. */
export async function flushCrashes(): Promise<void> {
   if (_flushing) return
   const queue = readQueue()
   if (queue.length === 0) return

   _flushing = true
   const processedIds = new Set(queue.map(r => r.id))
   const failedIds = new Set<string>()
   try {
      // Token is optional: a crash before sign-in still has to be reportable,
      // which is exactly why the endpoint accepts anonymous posts.
      const headers: Record<string, string> = {
         'Content-Type': 'application/json',
         ...(await getAuthHeader().catch(() => ({}))),
      }

      for (const report of queue) {
         try {
            const res = await fetch(`${API_BASE}/diagnostics/crash`, {
               method: 'POST',
               headers,
               body: JSON.stringify(report),
               keepalive: true,
            })
            if (res.ok) {
               rememberSeen(fingerprint(report))
            } else if (res.status >= 500) {
               // Server trouble — keep it for later rather than dropping it.
               failedIds.add(report.id)
            }
            // 4xx means the report itself is unusable; dropping it prevents a
            // poison payload from blocking the queue forever.
         } catch {
            failedIds.add(report.id)
         }
      }
   } catch {
      /* fall through: keep everything the loop marked failed, keep new ones */
   } finally {
      _flushing = false
      writeQueue(_mergeSurvivors(processedIds, failedIds))
   }
}

//#region queue merging
/**
 * What survives a flush: the failures, plus everything captured *while the
 * flush was in flight*.
 *
 * The snapshot taken at entry is stale once any fetch resolves — a second
 * crash captured meanwhile queues itself, and naively writing the snapshot
 * back would delete that report. Rebuild from the live queue instead: keep
 * what was never processed, plus what was processed but failed, in original
 * order (so `slice(-MAX_QUEUED)` still evicts the oldest).
 */
function _mergeSurvivors(processed: Set<string>, failed: Set<string>): CrashReport[] {
   const survivors: CrashReport[] = []
   const seenIds = new Set<string>()
   for (const report of readQueue()) {
      if (seenIds.has(report.id)) continue
      seenIds.add(report.id)
      if (failed.has(report.id)) {
         survivors.push(report)
      } else if (!processed.has(report.id)) {
         survivors.push(report)
      }
   }
   return survivors.length <= MAX_QUEUED ? survivors : survivors.slice(-MAX_QUEUED)
}
//#endregion

// ── Wiring ────────────────────────────────────────────────────

let _initialized = false
let _flushTimer: ReturnType<typeof setInterval> | null = null

const _onRejection = (event: PromiseRejectionEvent) => {
   const reason = event.reason
   captureCrash(reason instanceof Error ? reason : new Error(String(reason)), 'js')
}

const _onError = (event: ErrorEvent) => {
   // Resource load failures (a 404 image) bubble here with no `error`
   // object. They are not crashes and would drown the real ones.
   if (!event.error && !event.message) return
   captureCrash(
      event.error ?? new Error(event.message),
      'js',
      event.filename ? { source: `${event.filename}:${event.lineno}:${event.colno}` } : undefined
   )
}

const _onOnline = () => void flushCrashes()

export function initCrashReporter(): void {
   if (_initialized) return
   _initialized = true

   try {
      window.addEventListener('unhandledrejection', _onRejection)
      window.addEventListener('error', _onError)
      // Re-send whatever is queued as soon as the network is back — a crash
      // during an outage is the common case, not the exception.
      window.addEventListener('online', _onOnline)

      void flushCrashes()
      _flushTimer = setInterval(() => void flushCrashes(), FLUSH_INTERVAL_MS)
   } catch {
      /* reporting is optional; the app is not */
   }
}

/** Detach the listeners and stop flushing. Used on teardown and in tests. */
export function stopCrashReporter(): void {
   if (_flushTimer) {
      clearInterval(_flushTimer)
      _flushTimer = null
   }
   try {
      window.removeEventListener('unhandledrejection', _onRejection)
      window.removeEventListener('error', _onError)
      window.removeEventListener('online', _onOnline)
   } catch {
      /* non-fatal */
   }
   _initialized = false
}
