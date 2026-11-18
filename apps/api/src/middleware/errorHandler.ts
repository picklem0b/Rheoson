import { ApiError, ERRORS, errorBody, messageFor } from '@rheoson/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../env'
import { log } from '../lib/logger'

/**
 * Every failure leaves through here.
 *
 * A raised ApiError keeps its code and status. Anything else is a bug: it is
 * logged with the stack and answered with the generic code, because a stack
 * trace is not something to hand a user.
 */
export function handleError(error: Error, c: Context<AppEnv>) {
  const requestId = c.get('requestId') ?? 'req_unknown'

  if (error instanceof ApiError) {
    log('warn', 'request failed', {
      requestId,
      code: error.code,
      status: error.status,
      path: new URL(c.req.url).pathname,
    })

    return c.json(
      errorBody(requestId, error.code, error.message, error.details),
      error.status as ContentfulStatusCode,
    )
  }

  log('error', 'unhandled error', {
    requestId,
    path: new URL(c.req.url).pathname,
    message: error.message,
    stack: error.stack,
  })

  return c.json(
    errorBody(requestId, ERRORS.CORE.UNEXPECTED, messageFor(ERRORS.CORE.UNEXPECTED)),
    500,
  )
}

export function handleNotFound(c: Context<AppEnv>) {
  const requestId = c.get('requestId') ?? 'req_unknown'

  return c.json(
    errorBody(requestId, ERRORS.CORE.NOT_FOUND, messageFor(ERRORS.CORE.NOT_FOUND)),
    404,
  )
}
