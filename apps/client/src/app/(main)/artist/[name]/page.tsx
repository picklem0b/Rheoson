'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import TrackRow, { Artwork, Section } from '@/components/track/TrackRow';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { api, type Track } from '@/lib/api';

/**
 * Artist — the drill-down from the library.
 *
 * One header, one list, all playable in order. The artist name is the route
 * parameter and the engine matches it exactly, so a 404 here means the artist
 * left the library (files moved or were deleted) and the page says that
 * plainly instead of pretending to render something.
 */
export default function ArtistPage() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(Array.isArray(params.name) ? params.name[0] : params.name);

  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .artistTracks(name)
      .then((body) => {
        if (live) setTracks(body.tracks);
      })
      .catch(() => {
        if (live) setMissing(true);
      });
    return () => {
      live = false;
    };
  }, [name]);

  if (missing) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <PageHeading title={name} />
        <Empty text="This artist has no tracks in the library right now — the files may have moved." />
      </div>
    );
  }
  if (!tracks) return <Loading label={`Loading ${name}`} />;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-6 flex items-center gap-4">
        <span
          className="grid size-16 shrink-0 place-items-center text-2xl font-black uppercase"
          style={{
            background: 'var(--accent-subtle)',
            color: 'var(--accent-bright)',
            border: '2px solid var(--accent-border)',
            borderRadius: 'var(--radius-full)',
            fontFamily: 'var(--font-stack-display)',
          }}
          aria-hidden="true"
        >
          {name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Artist</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{name}</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {tracks.length} track{tracks.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <Section title="Tracks">
        {tracks.length === 0 ? (
          <Empty text="No tracks." />
        ) : (
          <ul className="p-1" style={{ background: 'var(--bg-surface)', border: '2px solid var(--border-strong)', borderRadius: 'var(--radius-brut)' }}>
            {tracks.map((track) => (
              <li key={track.id}>
                <TrackRow track={track} queue={tracks} showAlbum />
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
