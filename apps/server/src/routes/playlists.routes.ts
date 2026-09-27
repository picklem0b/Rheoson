import { isTrackId } from '@rheoson/shared';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../auth/plugin.js';
import { badRequest } from '../errors.js';
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removeTrackFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
} from '../services/account.service.js';

/**
 * Playlists.
 *
 * Ownership is enforced in the service, not here — every query is scoped by
 * owner, so a route cannot forget. A playlist that belongs to someone else
 * answers `PNF01` (not found), never `403`: the response must not confirm that
 * another user's playlist exists.
 *
 * Route order matters: `/api/playlists` (static collection) is registered
 * before `/api/playlists/:playlistId`, exactly like the track router's rule.
 */

const NameBody = z.object({ name: z.string().min(1), description: z.string().optional() });
const TrackBody = z.object({ trackId: z.string().min(1) });
const ReorderBody = z.object({ trackIds: z.array(z.string()).max(2000) });

function assertTrackId(value: unknown): string {
  if (!isTrackId(value)) throw badRequest('PVA09');
  return value;
}

export const registerPlaylistRoutes = (app: FastifyInstance): void => {
  app.get('/api/playlists', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ playlists: await listPlaylists(userId) });
  });

  app.post('/api/playlists', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = NameBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('PVA01');
    reply.code(201).send(await createPlaylist(userId, parsed.data.name, parsed.data.description));
  });

  app.get<{ Params: { playlistId: string } }>('/api/playlists/:playlistId', async (request, reply) => {
    const userId = requireUser(request);
    const id = request.params.playlistId;
    if (!id) throw badRequest('PVA04');
    reply.send(await getPlaylist(userId, id));
  });

  app.patch<{ Params: { playlistId: string } }>('/api/playlists/:playlistId', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = NameBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('PVA01');
    reply.send(await renamePlaylist(userId, request.params.playlistId, parsed.data.name));
  });

  app.delete<{ Params: { playlistId: string } }>('/api/playlists/:playlistId', async (request, reply) => {
    const userId = requireUser(request);
    reply.send(await deletePlaylist(userId, request.params.playlistId));
  });

  app.post<{ Params: { playlistId: string } }>('/api/playlists/:playlistId/tracks', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = TrackBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('PVA09');
    reply.send(await addTrackToPlaylist(userId, request.params.playlistId, assertTrackId(parsed.data.trackId)));
  });

  app.delete<{ Params: { playlistId: string; trackId: string } }>(
    '/api/playlists/:playlistId/tracks/:trackId',
    async (request, reply) => {
      const userId = requireUser(request);
      reply.send(
        await removeTrackFromPlaylist(
          userId,
          request.params.playlistId,
          assertTrackId(request.params.trackId),
        ),
      );
    },
  );

  app.put<{ Params: { playlistId: string } }>('/api/playlists/:playlistId/reorder', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = ReorderBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('PVA07');

    // Every id is validated before any write: a reorder must describe exactly
    // the playlist's tracks, and a partial list silently drops tracks.
    const ordered = parsed.data.trackIds.map(assertTrackId);
    reply.send(await reorderPlaylist(userId, request.params.playlistId, ordered));
  });
};
