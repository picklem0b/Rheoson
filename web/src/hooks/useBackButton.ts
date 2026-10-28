import { useEffect } from 'react'

/**
 * Let an open overlay consume the Android back button / gesture.
 *
 * The native shell dispatches a cancelable `rheoson:back` event before it
 * walks router history (see MainActivity). An overlay that is open calls
 * `preventDefault()` and closes itself, so back always undoes the last
 * visible step — closing the sheet — instead of navigating a page behind it
 * or leaving the app. With nothing open the event goes unhandled and the
 * shell steps back through history (or backgrounds the app at Home).
 */
export function useBackButton(active: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: Event) => {
      e.preventDefault()
      onBack()
    }
    window.addEventListener('rheoson:back', handler)
    return () => window.removeEventListener('rheoson:back', handler)
  }, [active, onBack])
}
