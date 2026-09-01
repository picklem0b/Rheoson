/**
 * Status bar theming — dynamically sets the Android status bar color
 * based on the dominant color of the current album art.
 *
 * Uses the Capacitor StatusBar plugin when available (native APK),
 * falls back to meta theme-color for PWA on mobile browsers.
 *
 * Both approaches are no-ops on desktop browsers where the status bar
 * isn't visible or controllable.
 */

import { getDominantColor } from './utils'

let _currentTrackId: string | null = null
let _updating = false

/**
 * Update the status bar / theme-color to match the current track's artwork.
 * Safe to call repeatedly — deduplicates by track ID.
 */
export async function updateStatusBarColor(
  artworkUrl: string | undefined,
  trackId: string
): Promise<void> {
  if (!artworkUrl || trackId === _currentTrackId || _updating) return
  _currentTrackId = trackId
  _updating = true

  try {
    const color = await getDominantColor(artworkUrl)
    setMetaThemeColor(color)

    // Try native Capacitor plugin (optional dependency)
    // Use a variable to prevent Rollup/Vite from resolving the import at build time
    try {
      const capPkg = '@capacitor/status-bar'
      const mod = await import(/* @vite-ignore */ capPkg)
      await mod.StatusBar.setStyle({ style: mod.Style.Dark })
      await mod.StatusBar.setBackgroundColor({ color })
    } catch {
      // Not running in Capacitor or plugin not available — no-op
    }
  } catch {
    // Color extraction failed — use default
  } finally {
    _updating = false
  }
}

/**
 * Reset status bar to the default theme color.
 */
export function resetStatusBarColor(): void {
  _currentTrackId = null
  setMetaThemeColor('#0a0a0a')
}

function setMetaThemeColor(color: string) {
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
}
