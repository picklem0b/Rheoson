import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config — migrations live in apps/server/drizzle/ and are
 * generated with `pnpm db:generate`, applied with `pnpm db:migrate`.
 * DATABASE_URL is read at runtime by the app; here it is only needed
 * for introspection commands (push/pull), which the migration flow
 * deliberately avoids (generate + migrate is the whole story).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/rheoson',
  },
});
