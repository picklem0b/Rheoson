import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../auth/plugin.js';
import { badRequest } from '../errors.js';
import {
  artwork,
  listAlbums,
  listArtists,
  listLibraryTracks,
  lyrics,
} from '../services/library.service.js';

/**
 * The library read surface.
 *
 * Two routes are deliberately *not* here: `/api/tracks/:id/stream` (the bytes,
 * which belong beside the streaming logic) and the error paths — a library of
 * zero tracks is `{ tracks: [], total: 0 }`, never a 404, because an empty
 * library is the normal state of a new install.
 */

const LyricsQuery = z.object({
  title: z.string().min(1),
  artist: z.string().default(''),
  album: z.string().optional(),
  duration: z.coerce.number().optional(),
});

export const registerLibraryRoutes = (app: FastifyInstance): void => {
  app.get<{ Querystring: { limit?: string; offset?: string } }>('/api/library/tracks', async (request, reply) => {
    const userId = requireUser(request);
    const limit = Number.parseInt(request.query.limit ?? '200', 10);
    const offset = Number.parseInt(request.query.offset ?? '0', 10);
    reply.send(
      await listLibraryTracks(userId, {
        limit: Number.isFinite(limit) ? limit : 200,
        offset: Number.isFinite(offset) ? offset : 0,
      }),
    );
  });

  app.get('/api/library/artists', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ artists: await listArtists(userId) });
  });

  app.get('/api/library/albums', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ albums: await listAlbums(userId) });
  });

  app.get<{ Params: { trackId: string } }>('/api/tracks/:trackId/artwork', async (request, reply) => {
    const userId = requireUser(request);
    const upstream = await artwork(userId, request.params.trackId);

    // Relayed, not re-encoded: the engine already knows whether the art was
    // embedded or a sibling file, and re-reading it here would only add a
    // second place that has to understand image bytes.
    reply
      .code(upstream.status)
      .header('content-type', upstream.headers.get('content-type') ?? 'image/jpeg')
      .header('cache-control', upstream.headers.get('cache-control') ?? 'public, max-age=86400');

    return reply.send(Buffer.from(await upstream.arrayBuffer()));
  });

  app.get<{ Querystring: z.infer<typeof LyricsQuery> }>('/api/lyrics', async (request, reply) => {
    requireUser(request);
    const parsed = LyricsQuery.safeParse(request.query);
    if (!parsed.success) throw badRequest('RVA03');
    reply.send(await lyrics(parsed.data.title, parsed.data.artist, parsed.data.album, parsed.data.duration));
  });
};
