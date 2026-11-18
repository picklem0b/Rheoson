import type { Context } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv, Bindings } from '../env'

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/**
 * An allow-list, never a wildcard.
 *
 * The API spends the owner's provider quota, so a page this app did not ship must
 * not be able to call it from a browser. Localhost is allowed by shape outside
 * production because a dev port changes per machine; everything else is listed
 * in APP_ORIGINS.
 */
function allowedOrigin(env: Bindings, origin: string | null): string | null {
  if (!origin) return null

  const configured = (env.APP_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (configured.includes(origin)) return origin
  if (env.ENVIRONMENT !== 'production' && LOCAL_ORIGIN.test(origin)) return origin

  return null
}

/** Hono answers the preflight, sets Vary, and only echoes an origin it knows. */
export const corsAllowList = cors({
  origin: (origin, c) => allowedOrigin((c as unknown as Context<AppEnv>).env, origin ?? null),
  allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 600,
  credentials: true,
})
