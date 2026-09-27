import { z } from 'zod';

/**
 * Server environment. Fails fast at boot — the Rheoson contract (config.py)
 * is fail-closed, and this keeps it: a missing critical var kills the
 * process in dev, and is loudly typed everywhere.
 */

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Clerk (auth) — same keys as the current stack. */
  CLERK_SECRET_KEY: z.string().default(''),
  CLERK_ISSUER: z.string().default(''),
  CLERK_WEBHOOK_SECRET: z.string().default(''),

  /** py engine bridge (ADR-2): internal-network static token. */
  ENGINE_URL: z.string().default('http://localhost:8001'),
  ENGINE_TOKEN: z.string().default(''),

  /** Relay (ADR-3) — the byte path; optional, the server falls back itself. */
  RELAY_URL: z.string().default('http://localhost:8002'),
  RELAY_TOKEN: z.string().default(''),

  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * Realtime fan-out across instances (ADR-6). Empty means in-process fan-out,
   * which is correct for one container and for every test.
   */
  REDIS_URL: z.string().default(''),

  /** Messaging rate limit — mirrors MLM01 on the current stack (30/min). */
  MESSAGE_RATE_PER_MIN: z.coerce.number().int().min(1).default(30),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid server environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isDev: ['development', 'dev', 'local', 'test', 'testing'].includes(parsed.data.NODE_ENV),
} as const;

export type Env = typeof env;
