import { okBody } from '@rheoson/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { healthReport } from '../services/health'

/**
 * Liveness and what is configured.
 *
 * It answers even when the database is down, because "the worker runs" and "the
 * database answers" are different questions and a monitor needs to tell them
 * apart.
 */
export const healthRoutes = new Hono<AppEnv>()

healthRoutes.get('/', (c) => c.json(okBody(c.get('requestId'), healthReport(c.env))))
