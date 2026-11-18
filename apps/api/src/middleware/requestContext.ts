import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { log, newRequestId } from '../lib/logger'

/**
 * A request id, and one line when the request is done.
 *
 * The id goes into the response header too, so a report from someone looking at
 * the network panel joins up with the server's line for it.
 */
export const withContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header('X-Request-Id') ?? newRequestId()
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)

  const startedAt = Date.now()
  await next()

  log(c.res.status >= 500 ? 'error' : 'info', 'request', {
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
    userId: c.get('userId') ?? undefined,
  })
})
