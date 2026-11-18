import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { rateLimit } from '../middleware/rateLimit'
import { healthRoutes } from './health'
import { meRoutes } from './me'
import { searchRoutes } from './search'
import { streamsRoutes } from './streams'

/** Everything under /api/v1. */
export const v1 = new Hono<AppEnv>()

v1.use('*', rateLimit)
v1.route('/health', healthRoutes)
v1.route('/me', meRoutes)
v1.route('/search', searchRoutes)
v1.route('/streams', streamsRoutes)
