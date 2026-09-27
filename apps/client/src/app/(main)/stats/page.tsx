'use client';

import { useEffect, useState } from 'react';

import TrackRow, { Section } from '@/components/track/TrackRow';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { api, type Track } from '@/lib/api';

/**
 * Listening stats — what you actually replay.
 *
 * Top tracks come from the play-history table, where every play is a row, while
 * the *list* is deduplicated. The counts are therefore honest totals rather than
 * "number of times it appeared in a recent list".
 */
export default function StatsPage() {
  const [top, setTop] = useState<Array<{ trackId: string; plays: number }> | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    void (async () => {
      const [topTracks, library] = await Promise.all([
        api.topTracks().catch(() => ({ items: [] })),
        api.libraryTracks(500).catch(() => ({ tracks: [], total: 0 })),
      ]);
      setTop(topTracks.items);
      setTracks(library.tracks);
    })();
  }, []);

  if (!top) return <Loading label="Counting your plays" />;

  const byId = new Map(tracks.map((track) => [track.id, track]));
  const entries = top
    .map((entry) => ({ track: byId.get(entry.trackId), plays: entry.plays }))
    .filter((entry): entry is { track: Track; plays: number } => Boolean(entry.track));

  const totalPlays = top.reduce((sum, entry) => sum + entry.plays, 0);
  const artists = new Map<string, number>();
  for (const entry of entries) {
    artists.set(entry.track.artist.name, (artists.get(entry.track.artist.name) ?? 0) + entry.plays);
  }
  const topArtists = [...artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeading title="Listening stats" note={`${totalPlays} plays recorded`} />

      <Section title="Top replayed songs">
        {entries.length === 0 ? (
          <Empty text="Nothing counted yet. A play counts once you have heard half a track, or thirty seconds." />
        ) : (
          <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {entries.map((entry) => (
              <li key={entry.track.id}>
                <TrackRow
                  track={entry.track}
                  queue={entries.map((item) => item.track)}
                  footer={
                    <span className="ml-1 text-[10px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {entry.plays}×
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Top artists">
        {topArtists.length === 0 ? (
          <Empty text="Play some music and your most-replayed artists will appear here." />
        ) : (
          <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {topArtists.map(([name, plays]) => (
              <li key={name} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm font-medium">{name}</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {plays} plays
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
