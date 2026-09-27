import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { db, pool } from './client.js';

/**
 * Apply every pending migration, then exit.
 *
 * `generate` + `migrate` is the whole story: the SQL under `drizzle/` is
 * reviewed like any other file, and this script is what applies it. Deployment
 * runs it before the server accepts traffic, so a schema change and the code
 * that needs it always land together — a server that boots against an older
 * schema fails loudly at the first query instead of silently serving wrong data.
 */
async function main(): Promise<void> {
  const started = Date.now();
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log(`✓ migrations applied in ${Date.now() - started}ms`);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('✗ migration failed:', error);
  process.exit(1);
});
