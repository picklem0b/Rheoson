import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The account service against a **real Postgres**.
 *
 * Likes, history and playlists are SQL, and SQL is the one thing a unit test
 * cannot honestly cover: unique constraints, `count(*)`, `ON CONFLICT`, group
 * ordering and ownership scoping all live in the database, not in JavaScript.
 * Mocking a Drizzle client would assert that the mock was called, which proves
 * nothing about any of it.
 *
 * The suite therefore runs only when a database is explicitly offered:
 *
 *   RUN_DB_TESTS=1 DATABASE_URL=postgres://… pnpm test
 *
 * CI provides one (see `.github/workflows/next-ci.yml`); a developer's machine
 * without Postgres skips it rather than failing.
 */

const enabled = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);

const USER_A = 'user_integration_a';
const USER_B = 'user_integration_b';

describe.skipIf(!enabled)('account service (Postgres)', () => {
  let account: typeof import('../src/services/account.service.js');
  let session: typeof import('../src/services/session.service.js');
  let db: typeof import('../src/db/client.js')['db'];

  beforeAll(async () => {
    account = await import('../src/services/account.service.js');
    session = await import('../src/services/session.service.js');
    ({ db } = await import('../src/db/client.js'));

    await session.ensureUser(USER_A);
    await session.ensureUser(USER_B);
  });

  afterAll(async () => {
    // Leave the database as it was found: an integration test that pollutes
    // makes the next run lie.
    const { likes, playHistory, playlists, users } = await import('../src/db/schema.js');
    const { eq, inArray } = await import('drizzle-orm');
    await db.delete(likes).where(inArray(likes.userId, [USER_A, USER_B]));
    await db.delete(playHistory).where(inArray(playHistory.userId, [USER_A, USER_B]));
    await db.delete(playlists).where(inArray(playlists.ownerId, [USER_A, USER_B]));
    await db.delete(users).where(inArray(users.id, [USER_A, USER_B]));
    void eq;
  });

  it('ensures a user row once, idempotently', async () => {
    const first = await session.ensureUser(USER_A);
    const second = await session.ensureUser(USER_A);

    expect(first.id).toBe(USER_A);
    expect(second.username).toBe(first.username);
  });

  it('likes idempotently and counts once', async () => {
    await account.likeTrack(USER_A, 'track_like_1');
    await account.likeTrack(USER_A, 'track_like_1');

    expect(await account.likedCount(USER_A)).toBe(1);
    expect(await account.listLikes(USER_A)).toEqual(['track_like_1']);

    expect(await account.unlikeTrack(USER_A, 'track_like_1')).toMatchObject({ liked: false });
    expect(await account.likedCount(USER_A)).toBe(0);
  });

  it('scopes likes per user', async () => {
    await account.likeTrack(USER_A, 'shared_track');
    await account.likeTrack(USER_B, 'shared_track');

    expect(await account.likedSet(USER_A, ['shared_track'])).toEqual(new Set(['shared_track']));
    expect((await account.listLikes(USER_B)).includes('shared_track')).toBe(true);

    const onlyB = await account.likedSet(USER_B, ['nothing_here']);
    expect(onlyB.size).toBe(0);
  });

  it('lists each played track once while counting every play', async () => {
    await account.recordPlay(USER_A, 'track_history_1', 30);
    await account.recordPlay(USER_A, 'track_history_1', 40);
    await account.recordPlay(USER_A, 'track_history_2', 12);

    const recent = await account.recentlyPlayed(USER_A, 10);
    const ids = recent.map((entry) => entry.trackId);
    expect(new Set(ids).size).toBe(ids.length);

    const top = await account.topTracks(USER_A, 10);
    expect(top[0]).toMatchObject({ trackId: 'track_history_1', plays: 2 });
  });

  it('follows and unfollows an artist', async () => {
    await account.followArtist(USER_A, 'artist_1');
    await account.followArtist(USER_A, 'artist_1');
    expect(await account.listFollows(USER_A)).toEqual(['artist_1']);

    await account.unfollowArtist(USER_A, 'artist_1');
    expect(await account.listFollows(USER_A)).toEqual([]);
  });

  it('keeps playlist order through add, remove and reorder', async () => {
    const playlist = await account.createPlaylist(USER_A, 'Integration playlist');
    await account.addTrackToPlaylist(USER_A, playlist.id, 't1');
    await account.addTrackToPlaylist(USER_A, playlist.id, 't2');
    const withThree = await account.addTrackToPlaylist(USER_A, playlist.id, 't3');

    expect(withThree.trackIds).toEqual(['t1', 't2', 't3']);

    const removed = await account.removeTrackFromPlaylist(USER_A, playlist.id, 't2');
    expect(removed.trackIds).toEqual(['t1', 't3']);

    const reordered = await account.reorderPlaylist(USER_A, playlist.id, ['t3', 't1']);
    expect(reordered.trackIds).toEqual(['t3', 't1']);
  });

  it('refuses a duplicate track with PCN02', async () => {
    const playlist = await account.createPlaylist(USER_A, 'Dupe check');
    await account.addTrackToPlaylist(USER_A, playlist.id, 't1');

    await expect(account.addTrackToPlaylist(USER_A, playlist.id, 't1')).rejects.toMatchObject({ code: 'PCN02' });
  });

  it('refuses a partial reorder rather than dropping tracks', async () => {
    const playlist = await account.createPlaylist(USER_A, 'Reorder check');
    await account.addTrackToPlaylist(USER_A, playlist.id, 't1');
    await account.addTrackToPlaylist(USER_A, playlist.id, 't2');

    await expect(account.reorderPlaylist(USER_A, playlist.id, ['t1'])).rejects.toMatchObject({ code: 'PVA07' });
  });

  it('hides another user’s playlist as not found', async () => {
    const playlist = await account.createPlaylist(USER_B, 'Private');

    // "Not found", never "forbidden": the response must not confirm it exists.
    await expect(account.getPlaylist(USER_A, playlist.id)).rejects.toMatchObject({ code: 'PNF01', status: 404 });
    await expect(account.deletePlaylist(USER_A, playlist.id)).rejects.toMatchObject({ code: 'PNF01' });
    await expect(account.addTrackToPlaylist(USER_A, playlist.id, 't1')).rejects.toMatchObject({ code: 'PNF01' });
  });

  it('validates a playlist name', async () => {
    await expect(account.createPlaylist(USER_A, '   ')).rejects.toMatchObject({ code: 'PVA01' });
    await expect(account.createPlaylist(USER_A, 'x'.repeat(121))).rejects.toMatchObject({ code: 'PVA02' });
  });
});
