import { FastifyInstance } from 'fastify';

/**
 * Health probe — intentionally unauthenticated (compose/GHA need it) and
 * intentionally silent about internals (no db state leaked here; liveness
 * is what orchestration asks, readiness comes from the Doctor surface).
 */
export const registerHealthRoutes = (app: FastifyInstance): void => {
  app.get('/health', async (_request, reply) => {
    reply.send({ ok: true });
  });
};
