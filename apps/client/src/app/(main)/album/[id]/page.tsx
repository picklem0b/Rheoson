'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import TrackRow, { Section } from '@/components/track/TrackRow';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { api, type Track } from '@/lib/api';

/**
 * Album — the drill-down from the library.
 *
 * The route parameter is the engine's `artist\0title` grouping key, so the
 * page renders exactly the grouping the library scan produced — no client-side
 * re-grouping that could disagree with the engine.
 */
export default function AlbumPage() {
  const params = useParams<{ id: string }>();
  const albumId = decodeURIComponent(Array.isArray(params.id) ? params.id[0] : params.id);

  const [album, setAlbum] = useState<{ title: string; artist: { id: string; name: string } } | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .albumTracks(albumId)
      .then((body) => {
        if (live) {
          setAlbum(body.album);
          setTracks(body.tracks);
        }
      })
      .catch(() => {
        if (live) setMissing(true);
      });
    return () => {
      live = false;
    };
  }, [albumId]);

  if (missing) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <PageHeading title="Album" />
        <Empty text="This album is no longer in the library — the files may have moved." />
      </div>
    );
  }
  if (!album || !tracks) return <Loading label="Loading album" />;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-6">
        <p className="eyebrow">Album</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{album.title}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          by{' '}
          <Link href={`/artist/${encodeURIComponent(album.artist.name)}`} className="font-bold" style={{ color: 'var(--accent-bright)' }}>
            {album.artist.name}
          </Link>{' '}
          · {tracks.length} track{tracks.length === 1 ? '' : 's'}
        </p>
      </header>

      <Section title="Tracks">
        {tracks.length === 0 ? (
          <Empty text="No tracks." />
        ) : (
          <ul className="p-1" style={{ background: 'var(--bg-surface)', border: '2px solid var(--border-strong)', borderRadius: 'var(--radius-brut)' }}>
            {tracks.map((track) => (
              <li key={track.id}>
                <TrackRow track={track} queue={tracks} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Link href="/library" className="font-bold" style={{ color: 'var(--accent-bright)' }}>
          ← Back to library
        </Link>
      </p>
    </div>
  );
}
