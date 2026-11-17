import { ERRORS, fail } from '@rheoson/shared'
import { createMiddleware } from 'hono/factory'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AppEnv } from '../env'

/** One JWKS fetch per isolate, reused until the key set rotates. */
let keySet: ReturnType<typeof createRemoteJWKSet> | null = null

/**
 * Verifies a Clerk session token.
 *
 * Only the signature and the issuer are trusted here; nothing is read from the
 * token that grants access. The token proves who is asking, and every query
 * scopes itself to that id.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization')

  if (!header?.startsWith('Bearer ')) {
    throw fail(ERRORS.AUTH.NOT_SIGNED_IN)
  }

  const jwksUrl = c.env.CLERK_JWKS_URL
  if (!jwksUrl) {
    throw fail(ERRORS.AUTH.NOT_SIGNED_IN, {
      append: '. Accounts are not configured on this deployment',
    })
  }

  keySet ??= createRemoteJWKSet(new URL(jwksUrl))

  try {
    const { payload } = await jwtVerify(header.slice('Bearer '.length).trim(), keySet, {
      issuer: c.env.CLERK_ISSUER || undefined,
    })

    if (!payload.sub) throw new Error('token has no subject')

    c.set('userId', payload.sub)
    c.set('claims', payload as Record<string, unknown>)
  } catch {
    throw fail(ERRORS.AUTH.SESSION_INVALID)
  }

  await next()
})
