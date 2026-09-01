/**
 * Haptic feedback utility — provides tactile feedback on supported devices.
 *
 * Uses the Web Vibration API (works on Android WebView) with a fallback
 * check for iOS which doesn't support vibration. On desktop, silently no-ops.
 *
 * Capacitor's Haptics plugin can be imported for richer patterns, but
 * the Vibration API covers the core use cases without an extra dependency.
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light:     10,
  medium:    20,
  heavy:     40,
  success:   [10, 30, 10],
  warning:   [20, 50, 20],
  error:     [40, 80, 40, 80, 40],
  selection: 5,
}

function _isSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function haptic(pattern: HapticPattern = 'light'): void {
  if (!_isSupported()) return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Vibration blocked by browser policy
  }
}

/** Cancel any ongoing vibration */
export function cancelHaptic(): void {
  if (!_isSupported()) return
  try {
    navigator.vibrate(0)
  } catch { /* ignore */ }
}

/** Check if haptic feedback is supported */
export function isHapticSupported(): boolean {
  return _isSupported()
}
