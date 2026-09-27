import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '../env.js';
import * as schema from './schema.js';

/**
 * Single pg pool + drizzle instance for the process. The pool is small by
 * design — Postgres is the brain (metadata/social), not a byte path; all
 * heavy traffic goes to the Go relay and the py engine.
 */
declare global {
  var __rheosonPool: Pool | undefined;
}

const pool =
  globalThis.__rheosonPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: env.PG_POOL_MAX,
    idleTimeoutMillis: 30_000,
  });

// Reuse across dev reloads (tsx watch) so sockets don't accumulate.
if (env.isDev) globalThis.__rheosonPool = pool;

export const db = drizzle(pool, { schema });
export { pool };
export type Database = typeof db;
