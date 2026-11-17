import { ERRORS, fail, okBody, searchQuerySchema } from '@rheoson/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { searchTracks } from '../services/catalogue'

/** Search. No account, no database: a query and what the provider said. */
export const searchRoutes = new Hono<AppEnv>()

searchRoutes.get('/', async (c) => {
  const query = searchQuerySchema.safeParse({
    q: c.req.query('q'),
    limit: c.req.query('limit'),
  })

  if (!query.success) {
    throw fail(ERRORS.CORE.INVALID_REQUEST, {
      details: { issues: query.error.issues.map((issue) => issue.message) },
    })
  }

  const items = await searchTracks(c.env, query.data, c.req.raw.signal)

  return c.json(okBody(c.get('requestId'), { items }))
})
