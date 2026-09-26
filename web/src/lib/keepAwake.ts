/**
 * Keep screen awake while music is playing.
 *
 * Uses the Screen Wake Lock API (supported on Android Chrome, Edge)
 * with a fallback to the Capacitor plugin for native APK.
 *
 * The lock is automatically released when the tab goes to background
 * and re-acquired when it returns to foreground.
 */

let _wakeLock: WakeLockSentinel | null = null
let _active = false

/** Settings → Playback → Keep screen awake. Read per request so a change
 *  applies on the next play without a reload; defaults on. */
function _keepAwakeEnabled(): boolean {
  try {
    const raw = localStorage.getItem('rheoson-keep-awake')
    return raw !== null ? (JSON.parse(raw) as boolean) : true
  } catch {
    return true
  }
}

/**
 * Request a screen wake lock. No-ops on unsupported browsers, and honours
 * the Settings toggle.
 */
export async function requestWakeLock(): Promise<void> {
  if (_active || !_keepAwakeEnabled()) return
  _active = true

  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen')
      _wakeLock.addEventListener('release', () => { _wakeLock = null })
    }
  } catch {
    // Wake Lock API denied or unavailable
  }

  // Try Capacitor native plugin (optional dependency)
  // Use a variable to prevent Rollup/Vite from resolving the import at build time
  try {
    const capPkg = '@capacitor/keep-awake'
    const mod = await import(/* @vite-ignore */ capPkg)
    await mod.KeepAwake.keepAwake()
  } catch {
    // Not in Capacitor or plugin unavailable
  }
}

/**
 * Release the screen wake lock.
 */
export async function releaseWakeLock(): Promise<void> {
  _active = false

  try {
    if (_wakeLock) {
      await _wakeLock.release()
      _wakeLock = null
    }
  } catch { /* ignore */ }

  try {
    const capPkg = '@capacitor/keep-awake'
    const mod = await import(/* @vite-ignore */ capPkg)
    await mod.KeepAwake.allowSleep()
  } catch {
    // Not in Capacitor — no-op
  }
}

/**
 * Handle visibility changes — re-acquire wake lock when tab becomes visible.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && _active && !_wakeLock) {
      await requestWakeLock()
    }
  })
}
