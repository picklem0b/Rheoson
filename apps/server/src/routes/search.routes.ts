import { FastifyInstance } from 'fastify';

import { requireUser } from '../auth/plugin.js';
import { search } from '../services/search.service.js';

/**
 * Search. One route, two sources, one answer.
 *
 * `remote=false` is the honest "search only my library" mode: no extraction,
 * no network, no waiting — which is what the library's own search box uses.
 */
export const registerSearchRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { q?: string; remote?: string; limit?: string } }>('/api/search', async (request, reply) => {
    const userId = requireUser(request);
    const limit = Number.parseInt(request.query.limit ?? '20', 10);
    reply.send(
      await search(userId, request.query.q ?? '', {
        remote: request.query.remote !== 'false',
        limit: Number.isFinite(limit) ? limit : 20,
      }),
    );
  });
};
