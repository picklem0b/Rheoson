import { FastifyInstance } from 'fastify';

import { busTransport } from '../realtime/bus.js';

/**
 * Health probe — intentionally unauthenticated (compose/GHA need it) and
 * intentionally silent about internals (no db state leaked here; liveness
 * is what orchestration asks, readiness comes from the Doctor surface).
 *
 * `bus` is reported because it is the one piece of infrastructure that changes
 * behaviour *silently*: a multi-instance deployment that quietly fell back to
 * local fan-out would look healthy while dropping every cross-instance event.
 * One word in a probe is cheaper than that mystery.
 */
export const registerHealthRoutes = (app: FastifyInstance): void => {
  app.get('/health', async (_request, reply) => {
    reply.send({ ok: true, bus: busTransport() });
  });
};
