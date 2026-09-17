/**
 * Where does this build think the API lives?
 *
 * This is a pure function on purpose. Getting it wrong is not a cosmetic bug:
 * a relative `/api` inside the APK is answered by the bundled asset handler
 * with `index.html`, so *every* request fails with "Backend returned HTML
 * instead of JSON" — the player never plays, the library looks empty, and the
 * doctor reports the API as unreachable. That already shipped once, so the
 * decision lives here where it can be tested exhaustively.
 */

/**
 * The one true production backend origin.
 *
 * Used only when the build supplied no usable `VITE_API_URL` — never as a
 * silent preference. It must point at the API service, not the SPA host:
 * the static site's catch-all route answers `/api/*` with `index.html` and
 * HTTP 200, which is the bug this whole module exists to prevent.
 */
export const CANONICAL_API_ORIGIN = 'https://rheoson-api-9e4c.onrender.com'

/** How the origin was decided — surfaced in Settings → Doctor. */
export type ApiTargetSource = 'dev-proxy' | 'env' | 'same-origin' | 'canonical-fallback'

export interface ApiTargetInput {
   /** Raw `VITE_API_URL` as baked into the bundle (may be undefined or empty). */
   rawApiUrl: string | undefined
   /** Vite dev server? Requests go through its proxy. */
   isDev: boolean
   /** Capacitor native shell? There is no proxy, so `/api` cannot work. */
   isNative: boolean
   /** The page's own origin (`window.location.origin`). */
   pageOrigin: string
}

export interface ApiTarget {
   /** Absolute origin, or `''` meaning "same origin as the page". */
   origin: string
   source: ApiTargetSource
}

function isAbsolute(url: string): boolean {
   return /^https?:\/\//i.test(url)
}

function isHttpOrigin(origin: string): boolean {
   return origin.startsWith('http://') || origin.startsWith('https://')
}

export function resolveApiTarget({
   rawApiUrl,
   isDev,
   isNative,
   pageOrigin,
}: ApiTargetInput): ApiTarget {
   const explicit = (rawApiUrl ?? '').trim().replace(/\/+$/, '')

   // Dev always goes through the Vite proxy, which forwards /api and
   // /socket.io to the backend — including when the APK is pointed at the dev
   // server, where the proxy is what avoids CORS on the device.
   if (isDev) return { origin: '', source: 'dev-proxy' }

   if (isAbsolute(explicit)) return { origin: explicit, source: 'env' }

   // Only an *explicitly* empty value asks for a same-origin deployment
   // (nginx in front of both the SPA and the API). An unset variable means
   // nobody said anything, and treating that as same-origin would point a
   // web deployment at its own SPA host — whose catch-all route answers
   // /api/* with index.html and HTTP 200. Same-origin is also meaningless
   // on native, where the page origin is capacitor://localhost or
   // https://localhost and /api comes out of the app bundle.
   const explicitlyEmpty = rawApiUrl !== undefined && explicit === ''
   if (explicitlyEmpty && !isNative && isHttpOrigin(pageOrigin)) {
      return { origin: pageOrigin, source: 'same-origin' }
   }

   // Nothing usable was supplied. Fall back to the known API host rather than
   // a relative path, which can never work here — and say so loudly elsewhere.
   return { origin: CANONICAL_API_ORIGIN, source: 'canonical-fallback' }
}

/** REST base for a resolved target. */
export function apiBaseFor(target: ApiTarget): string {
   return target.origin ? `${target.origin}/api` : '/api'
}

/**
 * Socket.IO origin. It takes a bare origin, not the `/api` path — passing the
 * path was the original cause of the APK's socket connection failing. An
 * empty string tells it to use the page origin (the proxied case).
 */
export function wsUrlFor(target: ApiTarget, pageOrigin: string): string {
   return target.origin || pageOrigin
}
