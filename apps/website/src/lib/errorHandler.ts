/**
 * Global error entry point.
 *
 * This used to install its own `window.onerror` / `unhandledrejection`
 * listeners that only wrote to the local log buffer — so a crash in the APK
 * left no trace anyone could act on, which is what made the Android
 * directory-scan crashes invisible. Those listeners now live in
 * `lib/crashReporter.ts` (one place, one dedupe table, one queue) and this
 * module is the thin seam the app already calls at boot.
 */

import { captureCrash, initCrashReporter } from './crashReporter';
import { logger } from './logger';

let _initialized = false;

export function initErrorHandler() {
  if (_initialized) return;
  _initialized = true;

  initCrashReporter();
}

/**
 * Record an exception. Kept as the app-facing name (call sites read better
 * than `captureCrash`) while the queueing, dedupe and delivery live in the
 * reporter.
 */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  logger.error('Captured exception', { error, ...context });
  captureCrash(
    error,
    'js',
    context
      ? Object.fromEntries(Object.entries(context).map(([k, v]) => [k, String(v)]))
      : undefined
  );
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>
) {
  logger[level](message, context);
  // Only errors are crashes; a warning is not worth a report.
  if (level === 'error') {
    captureCrash(new Error(message), 'js', context
      ? Object.fromEntries(Object.entries(context).map(([k, v]) => [k, String(v)]))
      : undefined);
  }
}
