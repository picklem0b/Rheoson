'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import TrackRow, { Artwork, Section, TrackCard } from '@/components/track/TrackRow';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { api, type Playlist, type Track } from '@/lib/api';
import { formatShortDate } from '@/lib/format';
import { useFavouritesStore } from '@/store/favourites.store';
import { usePlayerStore } from '@/store/player.store';
import { toast } from '@/store/toast.store';

/**
 * Library — everything on this server, filtered by a search box.
 *
 * The filter is **local**: it narrows an already-loaded list, so typing does
 * not hit the network and the list never disappears while it refetches. The
 * library search box is the one place where "filter what I have" is exactly
 * what the user means — the Search page is for looking beyond it.
 *
 * Playlists carry who made them and when, because on a shared instance that is
 * the difference between two identically-named lists.
 */

interface LibraryData {
  tracks: Track[];
  artists: Array<{ id: string; name: string; trackCount: number; albumCount: number }>;
  albums: Array<{ id: string; title: string; artist: { id: string; name: string }; trackCount: number }>;
  playlists: Playlist[];
}

type Tab = 'tracks' | 'liked' | 'artists' | 'albums' | 'playlists';

// One list, so the tabs cannot drift apart as the type changes.
const TABS: Tab[] = ['tracks', 'liked', 'artists', 'albums', 'playlists'];

export default function LibraryPage() {
  const router = useRouter();
  const [data, setData] = useState<LibraryData | null>(null);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('tracks');
  const liked = useFavouritesStore((state) => state.liked);

  const load = useCallback(async () => {
    const [tracks, artists, albums, playlists] = await Promise.all([
      api.libraryTracks(500).catch(() => ({ tracks: [], total: 0 })),
      api.libraryArtists().catch(() => ({ artists: [] })),
      api.libraryAlbums().catch(() => ({ albums: [] })),
      api.playlists().catch(() => ({ playlists: [] })),
    ]);
    setData({ tracks: tracks.tracks, artists: artists.artists, albums: albums.albums, playlists: playlists.playlists });
    // Favourites are a second read: the like list lives in Postgres, not the
    // engine, and a failure there must not blank the library.
    void useFavouritesStore.getState().load();
  }, []);

  // Async IIFE: the state update happens in a promise callback rather than in
  // the effect's synchronous body.
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const needle = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!data) return null;
    if (!needle) return data;
    return {
      tracks: data.tracks.filter((track) =>
        `${track.title} ${track.artist.name} ${track.album.title}`.toLowerCase().includes(needle),
      ),
      artists: data.artists.filter((artist) => artist.name.toLowerCase().includes(needle)),
      albums: data.albums.filter((album) => `${album.title} ${album.artist.name}`.toLowerCase().includes(needle)),
      playlists: data.playlists.filter((playlist) => playlist.title.toLowerCase().includes(needle)),
    };
  }, [data, needle]);

  if (!data || !filtered) return <Loading label="Reading your library" />;

  // The like list wins over the snapshot, so a heart tapped on another surface
  // is already reflected here without a refetch.
  const likedTracks = filtered.tracks.filter((track) => liked[track.id] ?? track.isLiked);
  const visible =
    tab === 'liked'
      ? likedTracks
      : tab === 'tracks'
        ? filtered.tracks
        : tab === 'artists'
          ? filtered.artists
          : tab === 'albums'
            ? filtered.albums
            : filtered.playlists;
  // Kept separate from `visible` so the list branch stays typed as tracks:
  // narrowing a union of array types by a sibling variable is a fight the
  // compiler wins, and the honest fix is not to widen it in the first place.
  const visibleTracks: Track[] = tab === 'liked' ? likedTracks : filtered.tracks;
  const counts: Record<Tab, number> = {
    tracks: data.tracks.length,
    liked: likedTracks.length,
    artists: data.artists.length,
    albums: data.albums.length,
    playlists: data.playlists.length,
  };

  const createPlaylist = async () => {
    const name = window.prompt('Playlist name');
    if (!name?.trim()) return;
    try {
      const playlist = await api.createPlaylist(name.trim());
      setData({ ...data, playlists: [playlist, ...data.playlists] });
      toast.success('Playlist created', playlist.title);
    } catch {
      // The API layer escalated it (5xx) or the toast below covers it.
      toast.error({ title: 'Could not create the playlist', code: 'PVA01' });
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeading title="Library" note={`${counts.tracks} tracks · ${counts.albums} albums · ${counts.artists} artists`} />

      <input
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter your library"
        aria-label="Filter your library"
        className="w-full rounded-[12px] px-4 py-3 text-sm outline-none"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      />

      <div className="mt-4 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Library sections">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className="shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors"
            style={{
              background: tab === item ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: tab === item ? 'var(--accent-bright)' : 'var(--text-secondary)',
              border: `1px solid ${tab === item ? 'var(--accent-border)' : 'var(--border)'}`,
            }}
          >
            {item} ({counts[item]})
          </button>
        ))}
        <button
          type="button"
          onClick={() => void createPlaylist()}
          className="shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          + New playlist
        </button>
      </div>

      <div className="mt-4">
        {visible.length === 0 ? (
          <Empty
            text={
              needle
                ? `Nothing matches “${filter}”.`
                : tab === 'tracks'
                  ? 'No tracks yet. Download something, or add files to the music directory.'
                  : tab === 'liked'
                    ? 'No favourites yet. Tap the heart on any track.'
                    : `No ${tab} yet.`
            }
          />
        ) : tab === 'tracks' || tab === 'liked' ? (
          <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {visibleTracks.map((track) => (
              <li key={track.id}>
                <TrackRow track={track} queue={visibleTracks} showAlbum />
              </li>
            ))}
          </ul>
        ) : tab === 'artists' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {filtered.artists.map((artist) => {
              const track = data.tracks.find((item) => item.artist.name === artist.name);
              return (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() =>
                    track &&
                    void usePlayerStore
                      .getState()
                      .playTrack(track, data.tracks.filter((item) => item.artist.name === artist.name))
                  }
                  className="cursor-pointer rounded-[14px] p-2.5 text-center"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                >
                  <span className="mx-auto block size-20 overflow-hidden rounded-full" style={{ border: '1px solid var(--border)' }}>
                    {track ? <Artwork track={track} size={80} rounded={9999} /> : null}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium">{artist.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {artist.trackCount} tracks
                  </span>
                </button>
              );
            })}
          </div>
        ) : tab === 'albums' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.albums.map((album) => {
              const track = data.tracks.find((item) => item.album.title === album.title && item.artist.name === album.artist.name);
              return (
                <TrackCard
                  key={album.id}
                  title={album.title}
                  subtitle={`${album.artist.name} · ${album.trackCount} tracks`}
                  artworkUrl={track ? api.artworkUrl(track.id) : undefined}
                />
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.playlists.map((playlist) => (
              <TrackCard
                key={playlist.id}
                title={playlist.title}
                subtitle={`${playlist.trackCount} tracks · created ${formatShortDate(playlist.createdAt)}`}
                artworkUrl={
                  playlist.trackIds[0] && data.tracks.find((track) => track.id === playlist.trackIds[0])
                    ? api.artworkUrl(playlist.trackIds[0])
                    : undefined
                }
                onClick={() => router.push(`/playlists/${encodeURIComponent(playlist.id)}`)}
              />
            ))}
          </div>
        )}
      </div>

      <Section title="Saved on this device">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {data.tracks.filter((track) => track.isDownloaded).length} of {data.tracks.length} tracks are available offline.
        </p>
      </Section>
    </div>
  );
}
