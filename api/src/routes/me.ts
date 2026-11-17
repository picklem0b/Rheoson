import { okBody } from '@rheoson/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { requireUser } from '../middleware/requireUser'
import { profileFor } from '../services/accounts'

export const meRoutes = new Hono<AppEnv>()

/**
 * The person behind the token.
 *
 * Answered from the stored row once there is one, from the token before that, and
 * from the token again if the database cannot be reached. The shape never
 * changes, so the client never learns which of the three answered.
 */
meRoutes.get('/', requireUser, async (c) => {
  const profile = await profileFor(c.env, c.get('userId') ?? '', c.get('claims'))
  return c.json(okBody(c.get('requestId'), profile))
})
