import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Services carry in-process state (rate limiter, presence) — isolate per file.
    pool: 'forks',
    // env.ts fails fast without DATABASE_URL; tests never touch the real DB
    // (the rate-limit path raises before the first round-trip).
    env: {
      DATABASE_URL: 'postgres://localhost:5432/rheoson_test',
      NODE_ENV: 'test',
    },
  },
});
