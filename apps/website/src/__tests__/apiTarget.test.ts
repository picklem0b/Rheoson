import { describe, it, expect } from 'vitest'
import {
   CANONICAL_API_ORIGIN,
   resolveApiTarget,
   apiBaseFor,
   wsUrlFor,
   type ApiTargetInput,
} from '@/lib/apiTarget'

const WEB_ORIGIN = 'https://rheoson-9e4c.onrender.com'

function target(overrides: Partial<ApiTargetInput> = {}) {
   return resolveApiTarget({
      rawApiUrl: undefined,
      isDev: false,
      pageOrigin: WEB_ORIGIN,
      ...overrides,
   })
}

describe('resolveApiTarget', () => {
   /**
    * The regression this guards: a build with no usable API origin shipped a
    * relative /api, and every request was answered with index.html.
    */
   it('never leaves a build without an absolute API origin', () => {
      const resolved = target({ rawApiUrl: '', pageOrigin: 'file://' })
      expect(resolved.origin).toBe(CANONICAL_API_ORIGIN)
      expect(resolved.source).toBe('canonical-fallback')
      expect(apiBaseFor(resolved)).toMatch(/^https:\/\//)
   })

   it('falls back to the API host, not the SPA host, when nothing was set', () => {
      const resolved = target({ rawApiUrl: undefined })
      expect(resolved.origin).toBe(CANONICAL_API_ORIGIN)
      // The SPA origin serves index.html for /api/* with HTTP 200 — that is
      // the misconfiguration this default exists to avoid.
      expect(resolved.origin).not.toBe(WEB_ORIGIN)
   })

   it('uses an absolute VITE_API_URL for production builds', () => {
      const resolved = target({ rawApiUrl: 'https://api.example.com/' })
      expect(resolved).toEqual({ origin: 'https://api.example.com', source: 'env' })
   })

   it('does not read an unset variable as same-origin on a web deployment', () => {
      // Unset and "" are different intents. Unset means nobody configured
      // anything, and the page origin here *is* the SPA host.
      const unset = target({ rawApiUrl: undefined, pageOrigin: WEB_ORIGIN })
      expect(unset.source).toBe('canonical-fallback')
   })

   it('honours an explicit empty value as same-origin', () => {
      const web = target({ rawApiUrl: '', pageOrigin: WEB_ORIGIN })
      expect(web).toEqual({ origin: WEB_ORIGIN, source: 'same-origin' })
   })

   it('treats an empty value on a non-http page origin as unusable', () => {
      // A file:// page has no reverse proxy to sit behind.
      const resolved = target({ rawApiUrl: '', pageOrigin: 'file://' })
      expect(resolved.source).toBe('canonical-fallback')
   })

   it('always routes dev through the proxy', () => {
      const resolved = target({ isDev: true })
      expect(resolved).toEqual({ origin: '', source: 'dev-proxy' })
      expect(apiBaseFor(resolved)).toBe('/api')
   })

   it('ignores whitespace and a trailing slash in the configured value', () => {
      expect(target({ rawApiUrl: '  https://api.example.com//  ' }).origin).toBe(
         'https://api.example.com',
      )
   })

   it('does not mistake a relative value for a configured origin', () => {
      // A build that literally sets VITE_API_URL=/api must not be trusted:
      // there is no proxy to resolve it against in a production bundle.
      const resolved = target({ rawApiUrl: '/api' })
      expect(resolved.source).toBe('canonical-fallback')
   })

   it('gives Socket.IO a bare origin, never the /api path', () => {
      const resolved = target({ rawApiUrl: 'https://api.example.com' })
      expect(apiBaseFor(resolved)).toBe('https://api.example.com/api')
      expect(wsUrlFor(resolved, WEB_ORIGIN)).toBe('https://api.example.com')
   })

   it('uses the page origin for Socket.IO in the proxied dev case', () => {
      const resolved = target({ isDev: true, pageOrigin: 'http://127.0.0.1:3000' })
      expect(wsUrlFor(resolved, 'http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
   })
})
