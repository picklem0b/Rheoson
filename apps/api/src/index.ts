import { okBody } from '@rheoson/shared'
import { Hono } from 'hono'
import type { AppEnv } from './env'
import { corsAllowList } from './middleware/corsAllowList'
import { handleError, handleNotFound } from './middleware/errorHandler'
import { withContext } from './middleware/requestContext'
import { v1 } from './routes'

/**
 * The worker.
 *
 * Order matters: a request id first so every later log line can carry it, then
 * CORS so a preflight is answered without touching a route, then the versioned
 * router with its own rate limit.
 */
const app = new Hono<AppEnv>()

app.use('*', withContext)
app.use('/api/*', corsAllowList)

app.route('/api/v1', v1)

app.get('/', (c) =>
  c.json(okBody(c.get('requestId'), { service: 'rheoson-api', version: '3.0.0', api: '/api/v1' })),
)

app.notFound(handleNotFound)
app.onError(handleError)

export default app

/* Exported for the CI smoke check, which imports the handler rather than
   starting a server. */
export { app }
