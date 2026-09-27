'use client';

import { useCallback, useEffect, useState } from 'react';

import TrackRow, { Artwork, Section, TrackCard } from '@/components/track/TrackRow';
import { Empty, Loading } from '@/components/ui/States';
import { api, type Playlist, type Track } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { usePlayerStore } from '@/store/player.store';

/**
 * Home — five sections, each answering a different question.
 *
 * Every section degrades to its own empty state rather than to a skeleton:
 * a new install has no history, no likes and no playlists, and showing grey
 * boxes forever is how an app looks broken when it is working correctly.
 *
 * The recommendations are derived from what is actually in the library and
 * what has actually been played (top artists, unplayed tracks by them) rather
 * than from a model: on a self-hosted instance there is no cross-user signal to
 * learn from, and pretending otherwise would be a lie about how it works.
 */

interface HomeData {
  lastPlayed: Array<{ trackId: string; playedAt: string }>;
  tracks: Track[];
  playlists: Playlist[];
  artists: Array<{ id: string; name: string; trackCount: number }>;
  topArtists: Array<{ trackId: string; plays: number }>;
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [trendingOpen, setTrendingOpen] = useState(false);
  const playTrack = usePlayerStore((state) => state.playTrack);

  const load = useCallback(async () => {
    // Each read is independent: a 404 on one (no history yet) must not blank
    // the whole page.
    const [history, library, playlists, artists] = await Promise.all([
      api.history(30).catch(() => ({ items: [] })),
      api.libraryTracks(400).catch(() => ({ tracks: [], total: 0 })),
      api.playlists().catch(() => ({ playlists: [] })),
      api.libraryArtists().catch(() => ({ artists: [] })),
    ]);
    const top = await api.topTracks().catch(() => ({ items: [] }));

    setData({
      lastPlayed: history.items,
      tracks: library.tracks,
      playlists: playlists.playlists,
      artists: artists.artists,
      topArtists: top.items,
    });
  }, []);

  // The fetch runs inside an async IIFE: the state update belongs to a promise
  // callback, not to the effect's synchronous pass, which is what keeps this
  // from being a render → fetch → render cascade.
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!data) {
    return <Loading label="Loading your library" />;
  }

  const byId = new Map(data.tracks.map((track) => [track.id, track]));

  // Last played: the history rows resolve to library tracks, and a row whose
  // track is no longer on disk is dropped — a row that cannot play is worse
  // than a shorter list.
  const lastPlayed = data.lastPlayed
    .map((entry) => ({ track: byId.get(entry.trackId), playedAt: entry.playedAt }))
    .filter((entry): entry is { track: Track; playedAt: string } => Boolean(entry.track))
    .slice(0, 8);

  const playCounts = new Map(data.topArtists.map((entry) => [entry.trackId, entry.plays]));
  const favouriteArtists = new Set(
    data.tracks
      .filter((track) => playCounts.has(track.id))
      .map((track) => track.artist.name),
  );

  // Recommended artists: those the listener has actually played, strongest
  // first, and never an artist with no playable track.
  const recommended = data.artists
    .filter((artist) => favouriteArtists.has(artist.name))
    .sort((a, b) => b.trackCount - a.trackCount)
    .slice(0, 6);

  // Trending this week: tracks added most recently to the library — the honest
  // definition of "new here this week" on a single-user instance.
  const thisWeek = data.tracks.slice(0, trendingOpen ? 10 : 5);

  const recentlyAdded = data.tracks.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-8 place-items-center rounded-[10px] text-sm font-bold md:hidden"
            style={{ background: 'var(--accent)', color: 'rgb(255 255 255)' }}
            aria-hidden="true"
          >
            R
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {data.tracks.length} track{data.tracks.length === 1 ? '' : 's'} in your library
        </p>
      </header>

      <Section title="Last played">
        {lastPlayed.length === 0 ? (
          <Empty text="Nothing played yet. Press play on any track and it will show up here." />
        ) : (
          <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {lastPlayed.map(({ track, playedAt }) => (
              <li key={`${track.id}-${playedAt}`}>
                <TrackRow
                  track={track}
                  queue={lastPlayed.map((entry) => entry.track)}
                  footer={
                    <span className="ml-1 text-[10px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {formatRelative(playedAt)}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Playlists and albums">
        {data.playlists.length === 0 && data.tracks.length === 0 ? (
          <Empty text="Playlists you make and albums in your library will appear here." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.playlists.slice(0, 5).map((playlist) => (
              <TrackCard
                key={playlist.id}
                title={playlist.title}
                subtitle={`${playlist.trackCount} track${playlist.trackCount === 1 ? '' : 's'}`}
                badge={
                  <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-bright)' }}>
                    Playlist
                  </span>
                }
              />
            ))}
            {data.playlists.length === 0
              ? recentlyAdded.slice(0, 5).map((track) => (
                  <TrackCard
                    key={track.id}
                    title={track.album?.title ?? track.title}
                    subtitle={track.artist?.name}
                    artworkUrl={api.artworkUrl(track.id)}
                  />
                ))
              : null}
          </div>
        )}
      </Section>

      <Section title="Recommended artists">
        {recommended.length === 0 ? (
          <Empty text="Artists you listen to will be recommended here once you have some history." />
        ) : (
          <div className="flex flex-wrap gap-3">
            {recommended.map((artist) => {
              const track = data.tracks.find((item) => item.artist.name === artist.name);
              return (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => track && void playTrack(track, data.tracks.filter((item) => item.artist.name === artist.name))}
                  className="w-32 cursor-pointer text-center"
                >
                  <span className="mx-auto block size-24 overflow-hidden rounded-full" style={{ border: '1px solid var(--border)' }}>
                    {track ? <Artwork track={track} size={96} rounded={9999} /> : null}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium">{artist.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {artist.trackCount} track{artist.trackCount === 1 ? '' : 's'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Trending this week"
        action={{
          label: trendingOpen ? 'Show less' : 'See all',
          onClick: () => setTrendingOpen((open) => !open),
        }}
      >
        {thisWeek.length === 0 ? (
          <Empty text="Download or add tracks and the newest ones will show up here." />
        ) : (
          <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {thisWeek.map((track) => (
              <li key={track.id}>
                <TrackRow track={track} queue={thisWeek} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Made for you">
        {data.tracks.length === 0 ? (
          <Empty text="A few playlists built from your library will appear here." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TrackCard
              title="Your favourites"
              subtitle="Everything you liked"
              artworkUrl={data.tracks.find((track) => track.isLiked) ? api.artworkUrl(data.tracks.find((track) => track.isLiked)!.id) : undefined}
            />
            <TrackCard
              title="Recently added"
              subtitle="Newest in your library"
              artworkUrl={data.tracks[0] ? api.artworkUrl(data.tracks[0].id) : undefined}
            />
            <TrackCard
              title="Deep cuts"
              subtitle="Tracks you have not played yet"
              artworkUrl={
                data.tracks.find((track) => !playCounts.has(track.id)) ? api.artworkUrl(data.tracks.find((track) => !playCounts.has(track.id))!.id) : undefined
              }
            />
            <TrackCard
              title="Most replayed"
              subtitle="What you keep coming back to"
              artworkUrl={data.topArtists[0] && byId.get(data.topArtists[0].trackId) ? api.artworkUrl(byId.get(data.topArtists[0].trackId)!.id) : undefined}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

