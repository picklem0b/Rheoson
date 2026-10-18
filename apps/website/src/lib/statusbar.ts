/**
 * Status bar theming — sets the PWA's `theme-color` to the dominant color of
 * the current album art, which is what Android Chrome tints its status bar
 * with. A no-op on desktop browsers, where no status bar is visible.
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
