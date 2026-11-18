import { ERRORS, fail } from '@rheoson/shared'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'

interface Bucket {
  count: number
  resetAt: number
}

/** Per isolate, which is per worker instance. Enough to stop a loop, not a botnet. */
const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 1000

/**
 * A fixed window per caller.
 *
 * The point is to stop a runaway client from spending the owner's provider
 * quota, not to police people: the limit is generous and the headers say where
 * the caller stands.
 */
export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limit = Number(c.env.RATE_LIMIT_PER_MINUTE ?? 120)
  const windowMs = 60_000
  const key = c.get('userId') ?? c.req.header('CF-Connecting-IP') ?? 'anonymous'

  const now = Date.now()

  /* A window per caller is a map keyed by caller, and that map grows for as long
     as the isolate lives. Expired windows are swept before the map is allowed to
     grow past its cap, so a busy address cannot retain memory after its window
     has passed. */
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, value] of buckets) {
      if (now >= value.resetAt) buckets.delete(bucketKey)
    }
    if (buckets.size > MAX_BUCKETS) buckets.clear()
  }

  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
  } else {
    bucket.count += 1
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      throw fail(ERRORS.CORE.RATE_LIMITED, { details: { retryAfterSeconds: retryAfter } })
    }
  }

  const current = buckets.get(key)
  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit - (current?.count ?? 0))))

  await next()
})
