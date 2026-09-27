import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import {
  followedArtists,
  likes,
  playHistory,
  playlistTracks,
  playlists,
} from '../db/schema.js';
import { ApiError, badRequest, notFound } from '../errors.js';

/**
 * The social brain: likes, play history, artist follows and playlists.
 *
 * Four rules, each one a bug the current stack paid for:
 *
 * 1. **Every query is owner-scoped.** There is no code path that reads or
 *    writes another user's row, so a route cannot forget.
 * 2. **Likes are idempotent.** A double-tap or a retried request must not
 *    create two rows or shift a count by two.
 * 3. **History keeps every play but lists each track once.** "Recently played"
 *    is a list of tracks, not of events; the events are kept so listening
 *    stats can count them.
 * 4. **A reorder must describe exactly the playlist's tracks.** A partial list
 *    silently drops tracks, which is why it is rejected instead.
 */

export interface PlaylistSummary {
  id: string;
  title: string;
  trackIds: string[];
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Likes ─────────────────────────────────────────────────────

export async function listLikes(userId: string, limit = 500, offset = 0): Promise<string[]> {
  const rows = await db
    .select({ trackId: likes.trackId })
    .from(likes)
    .where(eq(likes.userId, userId))
    .orderBy(desc(likes.likedAt))
    .limit(clampLimit(limit))
    .offset(Math.max(0, offset));
  return rows.map((row) => row.trackId);
}

export async function likedCount(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.userId, userId));
  return Number(rows[0]?.count ?? 0);
}

/** True when a track is liked — the flag every list needs, in one query. */
export async function likedSet(userId: string, trackIds: string[]): Promise<Set<string>> {
  if (trackIds.length === 0) return new Set();
  const rows = await db
    .select({ trackId: likes.trackId })
    .from(likes)
    .where(and(eq(likes.userId, userId), inArray(likes.trackId, trackIds)));
  return new Set(rows.map((row) => row.trackId));
}

export async function likeTrack(userId: string, trackId: string): Promise<{ liked: true; trackId: string }> {
  await db
    .insert(likes)
    .values({ userId, trackId })
    // Idempotent by unique key: a retry or a double-tap is the same like.
    .onConflictDoNothing({ target: [likes.userId, likes.trackId] });
  return { liked: true, trackId };
}

export async function unlikeTrack(userId: string, trackId: string): Promise<{ liked: false; trackId: string }> {
  await db.delete(likes).where(and(eq(likes.userId, userId), eq(likes.trackId, trackId)));
  return { liked: false, trackId };
}

// ── History ───────────────────────────────────────────────────

export async function recordPlay(userId: string, trackId: string, secondsPlayed?: number): Promise<void> {
  await db.insert(playHistory).values({
    userId,
    trackId,
    secondsPlayed: typeof secondsPlayed === 'number' ? Math.max(0, Math.floor(secondsPlayed)) : null,
  });
}

/** Most recent plays, each track listed once — what "Recently played" means. */
export async function recentlyPlayed(userId: string, limit = 50): Promise<Array<{ trackId: string; playedAt: string }>> {
  const rows = await db
    .select({ trackId: playHistory.trackId, playedAt: playHistory.playedAt })
    .from(playHistory)
    .where(eq(playHistory.userId, userId))
    .orderBy(desc(playHistory.playedAt))
    .limit(clampLimit(limit * 4));

  const seen = new Set<string>();
  const out: Array<{ trackId: string; playedAt: string }> = [];
  for (const row of rows) {
    if (seen.has(row.trackId)) continue;
    seen.add(row.trackId);
    out.push({ trackId: row.trackId, playedAt: toIso(row.playedAt) });
    if (out.length >= limit) break;
  }
  return out;
}

/** Top tracks by play count — the listening-stats surface. */
export async function topTracks(userId: string, limit = 20): Promise<Array<{ trackId: string; plays: number }>> {
  const rows = await db
    .select({ trackId: playHistory.trackId, plays: sql<number>`count(*)::int` })
    .from(playHistory)
    .where(eq(playHistory.userId, userId))
    .groupBy(playHistory.trackId)
    .orderBy(desc(sql`count(*)`))
    .limit(clampLimit(limit));
  return rows.map((row) => ({ trackId: row.trackId, plays: Number(row.plays) }));
}

export async function clearHistory(userId: string): Promise<number> {
  const rows = await db.delete(playHistory).where(eq(playHistory.userId, userId)).returning({ id: playHistory.id });
  return rows.length;
}

// ── Artist follows ────────────────────────────────────────────

export async function listFollows(userId: string): Promise<string[]> {
  const rows = await db
    .select({ artistId: followedArtists.artistId })
    .from(followedArtists)
    .where(eq(followedArtists.userId, userId))
    .orderBy(desc(followedArtists.followedAt));
  return rows.map((row) => row.artistId);
}

export async function followArtist(userId: string, artistId: string): Promise<{ following: true; artistId: string }> {
  await db
    .insert(followedArtists)
    .values({ userId, artistId })
    .onConflictDoNothing({ target: [followedArtists.userId, followedArtists.artistId] });
  return { following: true, artistId };
}

export async function unfollowArtist(userId: string, artistId: string): Promise<{ following: false; artistId: string }> {
  await db
    .delete(followedArtists)
    .where(and(eq(followedArtists.userId, userId), eq(followedArtists.artistId, artistId)));
  return { following: false, artistId };
}

// ── Playlists ─────────────────────────────────────────────────

const MAX_PLAYLIST_NAME = 120;
const MAX_PLAYLIST_TRACKS = 2000;

export async function listPlaylists(userId: string): Promise<PlaylistSummary[]> {
  const rows = await db
    .select()
    .from(playlists)
    .where(eq(playlists.ownerId, userId))
    .orderBy(desc(playlists.createdAt));

  if (rows.length === 0) return [];

  const memberships = await db
    .select({ playlistId: playlistTracks.playlistId, trackId: playlistTracks.trackId })
    .from(playlistTracks)
    .where(
      inArray(
        playlistTracks.playlistId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(playlistTracks.position);

  const byPlaylist = new Map<string, string[]>();
  for (const row of memberships) {
    const list = byPlaylist.get(row.playlistId) ?? [];
    list.push(row.trackId);
    byPlaylist.set(row.playlistId, list);
  }

  return rows.map((row) => shape(row, byPlaylist.get(row.id) ?? []));
}

export async function getPlaylist(userId: string, playlistId: string): Promise<PlaylistSummary> {
  const rows = await db
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.ownerId, userId)))
    .limit(1);
  const row = rows[0];
  // A playlist that exists but is not yours is "not found", never "forbidden":
  // the response must not confirm that someone else's playlist is there.
  if (!row) throw notFound('PNF01');

  const trackIds = await orderedTrackIds(playlistId);
  return shape(row, trackIds);
}

export async function createPlaylist(userId: string, name: string, description?: string): Promise<PlaylistSummary> {
  const clean = validateName(name);
  const rows = await db
    .insert(playlists)
    .values({ ownerId: userId, name: clean, description: description?.slice(0, 500) ?? null })
    .returning();
  return shape(rows[0], []);
}

export async function renamePlaylist(userId: string, playlistId: string, name: string): Promise<PlaylistSummary> {
  const clean = validateName(name);
  const rows = await db
    .update(playlists)
    .set({ name: clean, updatedAt: new Date() })
    .where(and(eq(playlists.id, playlistId), eq(playlists.ownerId, userId)))
    .returning();
  if (rows.length === 0) throw notFound('PNF01');
  return shape(rows[0], await orderedTrackIds(playlistId));
}

export async function deletePlaylist(userId: string, playlistId: string): Promise<{ id: string; deleted: true }> {
  const rows = await db
    .delete(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.ownerId, userId)))
    .returning({ id: playlists.id });
  if (rows.length === 0) throw notFound('PNF01');
  return { id: playlistId, deleted: true };
}

export async function addTrackToPlaylist(userId: string, playlistId: string, trackId: string): Promise<PlaylistSummary> {
  await assertOwned(userId, playlistId);

  const existing = await orderedTrackIds(playlistId);
  if (existing.includes(trackId)) {
    // Adding a track twice is a client mistake worth naming, not a silent
    // no-op: the UI should say "already in this playlist".
    throw new ApiError('PCN02', 409);
  }
  if (existing.length >= MAX_PLAYLIST_TRACKS) {
    throw badRequest('PVA03', `A playlist holds at most ${MAX_PLAYLIST_TRACKS} tracks`);
  }

  await db.insert(playlistTracks).values({ playlistId, trackId, position: existing.length });
  await touch(userId, playlistId);
  return getPlaylist(userId, playlistId);
}

export async function removeTrackFromPlaylist(
  userId: string,
  playlistId: string,
  trackId: string,
): Promise<PlaylistSummary> {
  await assertOwned(userId, playlistId);

  const removed = await db
    .delete(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))
    .returning({ trackId: playlistTracks.trackId });
  if (removed.length === 0) throw notFound('PNF02');

  // Positions are renumbered from the ordered list: gaps are how a later
  // insert lands in the wrong place.
  await renumber(playlistId, (await orderedTrackIds(playlistId)).filter((id) => id !== trackId));
  await touch(userId, playlistId);
  return getPlaylist(userId, playlistId);
}

export async function reorderPlaylist(
  userId: string,
  playlistId: string,
  orderedIds: string[],
): Promise<PlaylistSummary> {
  await assertOwned(userId, playlistId);

  const current = await orderedTrackIds(playlistId);
  const requested = new Set(orderedIds);
  const sameMembers =
    orderedIds.length === current.length && current.every((id) => requested.has(id));
  if (!sameMembers) {
    // A partial list would silently drop tracks; refusing is the honest answer.
    throw badRequest('PVA07');
  }

  for (const [index, trackId] of orderedIds.entries()) {
    await db
      .update(playlistTracks)
      .set({ position: index })
      .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)));
  }
  await touch(userId, playlistId);
  return getPlaylist(userId, playlistId);
}

// ── Helpers ───────────────────────────────────────────────────

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(Math.floor(limit), 500));
}

function validateName(name: string): string {
  const clean = (name ?? '').trim();
  if (!clean) throw badRequest('PVA01');
  if (clean.length > MAX_PLAYLIST_NAME) throw badRequest('PVA02');
  return clean;
}

async function orderedTrackIds(playlistId: string): Promise<string[]> {
  const rows = await db
    .select({ trackId: playlistTracks.trackId, position: playlistTracks.position })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(playlistTracks.position);
  return rows.map((row) => row.trackId);
}

async function assertOwned(userId: string, playlistId: string): Promise<void> {
  const rows = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.ownerId, userId)))
    .limit(1);
  if (rows.length === 0) throw notFound('PNF01');
}

async function touch(userId: string, playlistId: string): Promise<void> {
  await db
    .update(playlists)
    .set({ updatedAt: new Date() })
    .where(and(eq(playlists.id, playlistId), eq(playlists.ownerId, userId)));
}

async function renumber(playlistId: string, ordered: string[]): Promise<void> {
  for (const [index, trackId] of ordered.entries()) {
    await db
      .update(playlistTracks)
      .set({ position: index })
      .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)));
  }
}

function shape(
  row: { id: string; name: string; createdAt: Date | string; updatedAt: Date | string },
  trackIds: string[],
): PlaylistSummary {
  return {
    id: row.id,
    title: row.name,
    trackIds,
    trackCount: trackIds.length,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
