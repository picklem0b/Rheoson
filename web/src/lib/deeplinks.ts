/**
 * Deep link handler — processes incoming app links and custom URL schemes.
 *
 * Supported schemes:
 *   rheoson://search?q=kendrick+lamar
 *   rheoson://play?trackId=dQw4w9WgXcQ
 *   rheoson://playlist?id=xxx
 *
 * App Links (Android):
 *   https://rheoson.onrender.com/search?q=...
 *   https://rheoson.onrender.com/playlist/:id
 *
 * Works both in browser (hash/ pathname parsing) and Capacitor native.
 */

// Capacitor App plugin — optional dependency, dynamically imported via variable
// to prevent Rollup/Vite from resolving at build time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let App: any = null

async function loadCapacitorApp(): Promise<void> {
  if (App !== null) return
  try {
    const capPkg = '@capacitor/app'
    const mod = await import(/* @vite-ignore */ capPkg)
    App = mod.App
  } catch {
    // Not in Capacitor environment
  }
}

type DeepLinkHandler = (path: string, params: Record<string, string>) => void

const _handlers: DeepLinkHandler[] = []

/**
 * Register a handler for deep links.
 */
export function onDeepLink(handler: DeepLinkHandler): () => void {
  _handlers.push(handler)
  return () => {
    const idx = _handlers.indexOf(handler)
    if (idx >= 0) _handlers.splice(idx, 1)
  }
}

/**
 * Parse a URL string into path + params.
 */
export function parseDeepLink(url: string): { path: string; params: Record<string, string> } | null {
  try {
    // Handle custom scheme: rheoson://search?q=...
    const schemeMatch = url.match(/^rheoson:\/\/(.+)/)
    if (schemeMatch) {
      const [path, queryString] = schemeMatch[1].split('?')
      const params = parseQueryString(queryString)
      return { path: `/${path}`, params }
    }

    // Handle https: https://rheoson.onrender.com/search?q=...
    const urlObj = new URL(url)
    const params = parseQueryString(urlObj.search)
    return { path: urlObj.pathname, params }
  } catch {
    return null
  }
}

function parseQueryString(qs?: string): Record<string, string> {
  if (!qs) return {}
  const params: Record<string, string> = {}
  new URLSearchParams(qs).forEach((v, k) => { params[k] = v })
  return params
}

function emit(url: string) {
  const parsed = parseDeepLink(url)
  if (parsed) {
    _handlers.forEach(h => h(parsed.path, parsed.params))
  }
}

/**
 * Initialize deep link listener.
 * Call once at app startup.
 */
export async function initDeepLinks(): Promise<() => void> {
  // Handle browser navigation events
  const handler = () => emit(window.location.href)
  window.addEventListener('popstate', handler)

  // Load Capacitor App plugin if available
  await loadCapacitorApp()

  // Handle Capacitor app links
  let cleanup: (() => void) | null = null
  if (App) {
    try {
      const handle = await App.addListener('appUrlOpen', (event: { url: string }) => {
        emit(event.url)
      })
      cleanup = () => handle.remove()
    } catch {
      // Not in Capacitor — no-op
    }
  }

  return () => {
    window.removeEventListener('popstate', handler)
    cleanup?.()
  }
}
