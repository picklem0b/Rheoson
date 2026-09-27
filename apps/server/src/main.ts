import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';

import { registerClerkWebhook } from './auth/clerk-webhook.js';
import { registerAuth } from './auth/plugin.js';
import { env } from './env.js';
import { errorHandler } from './errors.js';
import { registerHealthRoutes } from './routes/health.routes.js';
import { registerMessagingRoutes } from './routes/messaging.routes.js';

/**
 * Rheoson Next — API core (M2 skeleton).
 *
 * Ports the non-negotiables from the current stack:
 * - every data route requires a session (requireUser),
 * - every error carries a DCCNN code over the shared wire format,
 * - no login/register proxy ever exists (Clerk components only).
 */

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    // Pretty logs are a dev convenience, never a prod dependency.
    transport: env.isDev ? { target: 'pino-pretty' } : undefined,
  },
});

await app.register(helmet, { contentSecurityPolicy: false });
// Raw bodies enable svix signature verification on webhooks.
await app.register(rawBody, { global: false, runFirst: true });
await app.register(cors, {
  origin: env.isDev
    ? true
    : [/\.rheoson\.(app|dev)$/, process.env.CORS_ORIGIN].filter(
        (o): o is string | RegExp => Boolean(o),
      ),
  credentials: true,
});
await app.register(rateLimit, {
  global: false, // fine-grained limits live in services (MLM01); keep HTTP floor off
});

registerAuth(app);
registerClerkWebhook(app);
registerHealthRoutes(app);
registerMessagingRoutes(app);

app.setErrorHandler(errorHandler);

// ── Boot ──────────────────────────────────────────────────────

const start = async (): Promise<void> => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received — shutting down`);
    app.close().finally(() => process.exit(0));
  });
}

await start();
