import { ERRORS, fail, okBody, streamParamsSchema } from '@rheoson/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { resolveStream } from '../services/catalogue'

/**
 * A signed URL, resolved at play time.
 *
 * The worker never proxies bytes: the client gives this URL to an audio element
 * and the provider's CDN serves the audio, which keeps the request and transfer
 * budget for JSON.
 */
export const streamsRoutes = new Hono<AppEnv>()

streamsRoutes.get('/:provider/:providerTrackId', async (c) => {
  const params = streamParamsSchema.safeParse(c.req.param())

  if (!params.success) {
    throw fail(ERRORS.CORE.INVALID_REQUEST, {
      details: { issues: params.error.issues.map((issue) => issue.message) },
    })
  }

  const ticket = await resolveStream(
    c.env,
    params.data.provider,
    params.data.providerTrackId,
    c.req.raw.signal,
  )

  return c.json(okBody(c.get('requestId'), ticket))
})
