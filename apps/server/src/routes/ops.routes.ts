import { FastifyInstance } from 'fastify';

import { requireUser } from '../auth/plugin.js';
import { deepHealth, logStats, recentLogs, smokeTests } from '../services/ops.service.js';

/**
 * Ops routes — the admin console's backend.
 *
 * Every route requires a session like any other data route: the console is a
 * UI for the operator, not a second unauthenticated API. Log reads are the
 * operator's own server's telemetry; there is deliberately no cross-user or
 * cross-instance aggregation here.
 */
export const registerOpsRoutes = (app: FastifyInstance): void => {
  app.get('/api/ops/health', async (_request, reply) => {
    reply.send(await deepHealth());
  });

  app.get<{ Querystring: { count?: string; level?: string } }>('/api/ops/logs', async (request, reply) => {
    requireUser(request);
    const count = Number.parseInt(request.query.count ?? '120', 10);
    reply.send({
      entries: recentLogs(Number.isFinite(count) ? count : 120, request.query.level),
      stats: logStats(),
    });
  });

  app.post('/api/ops/smoke', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ results: await smokeTests(userId) });
  });
};
