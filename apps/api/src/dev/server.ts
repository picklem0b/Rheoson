import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { config } from 'dotenv'
import app from '../index'
import type { AppEnv, Bindings } from '../env'
import { providerHealth } from '../providers/registry'
import { webRoutes } from './webRoutes'

/**
 * The development backend: one Node process serving the V2 app and the V3 API.
 *
 * `apps/api` is the TypeScript backend (the V2 Python service is gone). The
 * Worker entry in `../index.ts` deploys to Cloudflare and speaks `/api/v1`; this
 * entry runs the same Hono app on Node and adds the V2 surface in `webRoutes`, so
 * the copied V2 web app in `apps/web` has a backend to talk to on port 8000 —
 * exactly where its Vite proxy already points.
 *
 * Run it with `pnpm dev:api` from the repo root. It is a development tool: it
 * keeps no database, no account and no download worker, and it never answers a
 * 5xx to the client.
 */

config({ path: ['.dev.vars', '.env'] })

const env: Bindings = {
  ENVIRONMENT: process.env.ENVIRONMENT ?? 'development',
  APP_ORIGINS: process.env.APP_ORIGINS,
  DATABASE_URL: process.env.DATABASE_URL,
  CLERK_JWKS_URL: process.env.CLERK_JWKS_URL,
  CLERK_ISSUER: process.env.CLERK_ISSUER,
  RATE_LIMIT_PER_MINUTE: process.env.RATE_LIMIT_PER_MINUTE,
  AUDIUS_APP_NAME: process.env.AUDIUS_APP_NAME ?? 'Rheoson',
  JAMENDO_CLIENT_ID: process.env.JAMENDO_CLIENT_ID,
  SOUNDCLOUD_CLIENT_ID: process.env.SOUNDCLOUD_CLIENT_ID,
}

const bridge = new Hono<AppEnv>()

// Health and catalogue first so `/api/...` never reaches the V3 router, then the
// real worker app for `/api/v1`, `/` and its 404.
bridge.route('/api', webRoutes)
bridge.route('/', app)

/**
 * A failure here is a bug in the bridge, not in the provider.
 *
 * The client treats a 5xx as fatal and leaves the screen, and the whole point of
 * this process is that the old app stays usable while the backend is rebuilt, so
 * an unexpected error is logged and answered as an empty success instead.
 */
bridge.onError((error, c) => {
  console.error(`[dev-api] ${c.req.method} ${c.req.path}`, error)

  const status = error instanceof HTTPException ? error.status : 500
  if (status >= 500) {
    return c.json({ detail: 'The development bridge hit an unexpected error. See the dev-api log.' }, 200)
  }

  return c.json({ detail: error.message }, status as 400)
})

const port = Number(process.env.PORT ?? 8000)

serve({ fetch: (request) => bridge.fetch(request, env), port }, (info) => {
  const providers = providerHealth(env)
    .map((provider) => `${provider.id}${provider.configured ? '' : ' (no key)'}`)
    .join(', ')

  console.log(`[dev-api] listening on http://127.0.0.1:${info.port}`)
  console.log(`[dev-api] providers: ${providers}`)
  console.log('[dev-api] /api serves the V2 app · /api/v1 is the V3 contract')
})
