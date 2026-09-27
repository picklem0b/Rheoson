import { FastifyInstance } from 'fastify';

import { requireUser } from '../auth/plugin.js';
import { matchBatch, resolveLink } from '../services/spotify.service.js';

/**
 * Spotify share-link routes — resolve and batch-match.
 *
 * Resolve is the one-call answer ("paste a link, get tracks"); match is the
 * follow-up for rows the client kept unmatched. Both require a session like
 * every other data route.
 */
export const registerSpotifyRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { url?: string } }>('/api/spotify/resolve', async (request, reply) => {
    const userId = requireUser(request);
    reply.send(await resolveLink(userId, request.query.url ?? ''));
  });

  app.post('/api/spotify/match', async (request, reply) => {
    const userId = requireUser(request);
    const body = (request.body ?? {}) as { tracks?: unknown };
    reply.send(await matchBatch(userId, body.tracks));
  });
};
