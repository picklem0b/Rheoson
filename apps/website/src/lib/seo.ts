/**
 * Per-route SEO — the SPA's one honest concession to being a website.
 *
 * index.html carries the static defaults (what non-JS consumers see); this
 * module keeps title/canonical/og:url correct per route for everything that
 * renders the app. Wired in router.tsx via a listener so every navigation
 * updates the head without any page importing anything.
 *
 * Deliberately minimal: no history spam (replaceState-style semantics via
 * direct DOM writes), no title flicker on first paint (router effects run
 * before paint for the initial route).
 */

export const SITE_URL = 'https://rheoson.onrender.com'

interface RouteSeo {
  title: string
  /** Canonical path — defaults to the route itself. */
  path?: string
}

const ROUTE_SEO: Array<{ pattern: RegExp; seo: RouteSeo }> = [
  { pattern: /^\/$/,             seo: { title: 'Rheoson — Feel the Beat. Self-hosted music streaming.' } },
  { pattern: /^\/landing/,       seo: { title: 'Rheoson — Your library, your server', path: '/landing' } },
  { pattern: /^\/search/,        seo: { title: 'Search — Rheoson', path: '/search' } },
  { pattern: /^\/library/,       seo: { title: 'Your Library — Rheoson', path: '/library' } },
  { pattern: /^\/downloads/,     seo: { title: 'Downloads — Rheoson', path: '/downloads' } },
  { pattern: /^\/playlist\//,    seo: { title: 'Playlist — Rheoson' } },
  { pattern: /^\/album\//,       seo: { title: 'Album — Rheoson' } },
  { pattern: /^\/artist\//,      seo: { title: 'Artist — Rheoson' } },
  { pattern: /^\/stats/,         seo: { title: 'Listening Stats — Rheoson', path: '/stats' } },
  { pattern: /^\/settings/,      seo: { title: 'Settings — Rheoson', path: '/settings' } },
  { pattern: /^\/(auth|login|register)/, seo: { title: 'Sign in — Rheoson', path: '/auth' } },
]

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function applyRouteSeo(pathname: string): void {
  const match = ROUTE_SEO.find((r) => r.pattern.test(pathname))
  const seo = match?.seo ?? { title: 'Rheoson' }
  const canonicalPath = seo.path ?? pathname
  const canonical = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`

  document.title = seo.title
  upsertMeta('meta[name="robots"]', 'name', 'robots', 'index, follow')
  upsertMeta('meta[property="og:title"]', 'property', 'og:title', seo.title)
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical)

  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }
  link.href = canonical
}
