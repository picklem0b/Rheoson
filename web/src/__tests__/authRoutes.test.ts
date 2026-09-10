/**
 * Router regression tests for the auth flow.
 *
 * Bug: Clerk's path-routed <SignUp>/<SignIn> components navigate their
 * multi-step flows to sub-paths of their mount path (/auth/verify,
 * /auth/factor-one, /auth/sso-callback). The router only registered the
 * exact '/auth' route, so those steps fell through to the catch-all — a
 * user who had just authenticated (or was mid-verification) was bounced
 * back to the landing/marketing screen instead of completing sign-in and
 * reaching Home.
 *
 * These tests pin the route table: every URL Clerk can navigate to during
 * auth must match the AuthPage route, and nothing structural about the
 * guarded layout changes.
 */
import { describe, expect, it } from 'vitest'
import { matchRoutes } from 'react-router-dom'
import { routes } from '@/router'

describe('auth route table', () => {
  it('routes every Clerk auth sub-path to the auth page, not the catch-all', () => {
    // The exact URLs Clerk navigates to for verification, MFA, and SSO.
    const clerkSubPaths = [
      '/auth',
      '/auth/verify',
      '/auth/verify-email-address',
      '/auth/factor-one',
      '/auth/factor-two',
      '/auth/reset-password',
      '/auth/sso-callback',
      '/auth/sso-callback/oauth_google',
    ]

    for (const path of clerkSubPaths) {
      const matches = matchRoutes(routes, path)
      expect(matches, `no route matched ${path}`).toBeTruthy()
      const leafPath = matches![matches!.length - 1].route.path
      expect(leafPath, `${path} fell through to the catch-all`).toBe(
        // react-router normalizes '/auth/*' to path '/auth/*' on the leaf.
        path === '/auth' ? '/auth' : '/auth/*',
      )
    }
  })

  it('still routes the legacy sign-in/sign-up aliases to auth pages', () => {
    for (const [path, expected] of [
      ['/login', '/login'],
      ['/register', '/register'],
    ] as const) {
      const matches = matchRoutes(routes, path)!
      expect(matches[matches.length - 1].route.path).toBe(expected)
    }
  })

  it('keeps the guarded app routes nested under the layout', () => {
    for (const path of ['/', '/home', '/search', '/library']) {
      const matches = matchRoutes(routes, path)!
      // The first match must be the AuthGuard/RootLayout parent route.
      expect(matches[0].route.element, `${path} lost its guarded layout`).toBeDefined()
      expect(matches.length).toBeGreaterThan(1)
    }
  })

  it('leaves the app catch-all as the last resort', () => {
    const matches = matchRoutes(routes, '/totally-unknown-page')!
    // The top-level catch-all wins for unknown paths.
    expect(matches[matches.length - 1].route.path).toBe('*')
  })
})
