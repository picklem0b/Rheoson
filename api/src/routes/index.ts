import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { rateLimit } from '../middleware/rateLimit'
import { healthRoutes } from './health'

/** Everything under /api/v1. */
export const v1 = new Hono<AppEnv>()

v1.use('*', rateLimit)
v1.route('/health', healthRoutes)
