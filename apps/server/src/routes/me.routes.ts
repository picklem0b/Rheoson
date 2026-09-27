import { isTrackId } from '@rheoson/shared';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../auth/plugin.js';
import { badRequest } from '../errors.js';
import {
  clearHistory,
  followArtist,
  likedCount,
  likeTrack,
  listFollows,
  listLikes,
  recentlyPlayed,
  recordPlay,
  topTracks,
  unfollowArtist,
  unlikeTrack,
} from '../services/account.service.js';
import {
  DEFAULT_PREFERENCES,
  assertPatchShape,
  getPreferences,
  updatePreferences,
} from '../services/preferences.service.js';
import { ensureUser } from '../services/session.service.js';

/**
 * `/api/me` — everything that is true of the signed-in person.
 *
 * Every route requires a session (guest mode is not coming back), and every
 * mutation is idempotent where the client can plausibly retry: a like is a
 * fact, not a counter increment.
 */

const LikeBody = z.object({ trackId: z.string().min(1) });
const PlayBody = z.object({
  trackId: z.string().min(1),
  secondsPlayed: z.number().optional(),
});
const ArtistBody = z.object({ artistId: z.string().min(1) });

function trackIdOf(raw: unknown): string {
  if (!isTrackId(raw)) throw badRequest('TVA01');
  return raw;
}

export const registerMeRoutes = (app: FastifyInstance): void => {
  app.get('/api/me', async (request, reply) => {
    const userId = requireUser(request);
    reply.send(await ensureUser(userId));
  });

  // ── Preferences ─────────────────────────────────────────────
  // Registered before any dynamic sibling so a static path is never swallowed
  // by a parameter route — the ordering rule carried over from the track router.

  app.get('/api/me/preferences', async (request, reply) => {
    const userId = requireUser(request);
    reply.send(await getPreferences(userId));
  });

  app.get('/api/me/preferences/defaults', async (_request, reply) => {
    reply.send(DEFAULT_PREFERENCES);
  });

  app.put('/api/me/preferences', async (request, reply) => {
    const userId = requireUser(request);
    assertPatchShape(request.body);
    reply.send(await updatePreferences(userId, request.body));
  });

  // ── Likes ───────────────────────────────────────────────────

  app.get('/api/me/likes/count', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ count: await likedCount(userId) });
  });

  app.get<{ Querystring: { limit?: string; offset?: string } }>('/api/me/likes', async (request, reply) => {
    const userId = requireUser(request);
    const limit = Number.parseInt(request.query.limit ?? '500', 10);
    const offset = Number.parseInt(request.query.offset ?? '0', 10);
    const trackIds = await listLikes(userId, Number.isFinite(limit) ? limit : 500, Number.isFinite(offset) ? offset : 0);
    reply.send({ trackIds, total: await likedCount(userId) });
  });

  app.post('/api/me/likes', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = LikeBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('TVA01');
    reply.send(await likeTrack(userId, trackIdOf(parsed.data.trackId)));
  });

  app.delete<{ Params: { trackId: string } }>('/api/me/likes/:trackId', async (request, reply) => {
    const userId = requireUser(request);
    reply.send(await unlikeTrack(userId, trackIdOf(request.params.trackId)));
  });

  // ── History ─────────────────────────────────────────────────

  app.get<{ Querystring: { limit?: string } }>('/api/me/history', async (request, reply) => {
    const userId = requireUser(request);
    const limit = Number.parseInt(request.query.limit ?? '50', 10);
    reply.send({ items: await recentlyPlayed(userId, Number.isFinite(limit) ? limit : 50) });
  });

  app.get('/api/me/history/top', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ items: await topTracks(userId) });
  });

  app.post('/api/me/history', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = PlayBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('TVA02');
    await recordPlay(userId, trackIdOf(parsed.data.trackId), parsed.data.secondsPlayed);
    reply.code(202).send({ recorded: true });
  });

  app.delete('/api/me/history', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ removed: await clearHistory(userId) });
  });

  // ── Artist follows ─────────────────────────────────────────

  app.get('/api/me/follows', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ artistIds: await listFollows(userId) });
  });

  app.post('/api/me/follows', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = ArtistBody.safeParse(request.body);
    if (!parsed.success) throw badRequest('FVA01');
    reply.send(await followArtist(userId, parsed.data.artistId));
  });

  app.delete<{ Params: { artistId: string } }>('/api/me/follows/:artistId', async (request, reply) => {
    const userId = requireUser(request);
    const artistId = request.params.artistId;
    if (!artistId) throw badRequest('FVA01');
    reply.send(await unfollowArtist(userId, artistId));
  });
};
