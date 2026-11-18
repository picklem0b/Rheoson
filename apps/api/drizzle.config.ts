import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

/**
 * Migrations are generated from the schema and committed.
 *
 * They are never applied from inside the worker: the free plan's CPU budget is
 * for validation and JSON, and a migration in a request path is a migration that
 * runs when traffic decides. `pnpm db:migrate` runs it from a workstation with
 * `apps/api/.env` loaded, which is also why this file reads dotenv.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
