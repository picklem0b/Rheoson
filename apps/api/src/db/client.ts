import { ERRORS, fail } from '@rheoson/shared'
import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { Bindings } from '../env'
import * as schema from './schema'

export type Database = NeonHttpDatabase<typeof schema>

/**
 * A database handle, or a failure with a code.
 *
 * The Neon HTTP driver is one `fetch` per query, so there is no socket to pool
 * and no connection to leak between requests. Building a client is cheap; it is
 * cached per isolate only so a request does not allocate a query function it
 * throws away.
 */
let cached: { url: string; db: Database } | null = null

/** Whether this deployment has a database at all. Signed-out and local runs do not. */
export function hasDatabase(env: Bindings): boolean {
  return Boolean(env.DATABASE_URL)
}

export function database(env: Bindings): Database {
  const url = env.DATABASE_URL
  if (!url) throw fail(ERRORS.CORE.DB_UNAVAILABLE)

  if (cached?.url !== url) {
    cached = { url, db: drizzle(neon(url), { schema }) }
  }

  return cached.db
}
