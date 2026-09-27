'use client';

import { useEffect, useMemo, useState } from 'react';

import { Artwork } from '@/components/track/TrackRow';
import { api, type Lyrics } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { usePlayerStore } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';

/**
 * NowPlayingSheet — the full-screen player, TikTok/Spotify-shaped.
 *
 * Opens over the app when the mini player's artwork is tapped; drag or tap
 * the backdrop to send it away. Everything in it reads the two stores that
 * already exist (player, queue) — this component owns no playback state.
 *
 * The queue shows what is coming, not what has played: the current track is
 * the header of the screen already, and listing it twice is how the old
 * sheet earned its "the queue shows the song twice" bug report.
 */

function TransportButton({
  onClick,
  label,
  children,
  big = false,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid place-items-center text-[var(--text-primary)] transition-transform active:scale-90"
      style={{
        width: big ? 64 : 44,
        height: big ? 64 : 44,
        borderRadius: 'var(--radius-full)',
        border: big ? '2px solid var(--border-strong)' : '2px solid transparent',
        background: big ? 'var(--accent)' : 'transparent',
        color: big ? 'rgb(255 255 255)' : undefined,
      }}
    >
      {children}
    </button>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 256 256" aria-hidden="true">
      <path d={path} fill="currentColor" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function NowPlayingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = usePlayerStore((state) => state.current);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const toggle = usePlayerStore((state) => state.toggle);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const seek = usePlayerStore((state) => state.seek);

  const items = useQueueStore((state) => state.items);
  const queuePosition = useQueueStore((state) => state.position);

  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);

  // Lyrics preload the moment a track exists, so opening the panel is instant.
  // State updates belong to the promise callbacks, never the effect's sync
  // pass — that is the whole difference between a fetch and a cascade.
  useEffect(() => {
    if (!current) {
      const task = setTimeout(() => setLyrics(null), 0);
      return () => clearTimeout(task);
    }
    let live = true;
    api
      .lyrics(current.title, current.artist.name, current.duration)
      .then((result) => {
        if (live) setLyrics(result);
      })
      .catch(() => {
        if (live) setLyrics(null);
      });
    return () => {
      live = false;
    };
  }, [current]);

  const upcoming = useMemo(
    () => items.slice(queuePosition + 1).filter((track) => track.id !== current?.id),
    [items, queuePosition, current],
  );

  if (!open || !current) return null;

  const total = duration || current.duration || 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      style={{ background: 'var(--bg-base)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${current.title}`}
    >
      {/* Header: grab handle, source label, close. */}
      <div
        className="flex items-center justify-between px-4 pb-2 pt-3"
        style={{ paddingTop: 'calc(var(--safe-area-top) + 0.75rem)', borderBottom: '2px solid var(--border)' }}
      >
        <button type="button" onClick={onClose} aria-label="Close player" className="brut-btn size-9 !p-0" data-variant="ghost">
          <Icon path="M208 96h-56l48-48M208 160h-56l48 48M64 128h80l64-64M64 128l144 0M64 128l64 64" />
        </button>
        <p className="eyebrow">Now playing</p>
        <span className="size-9" aria-hidden="true" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-8">
        {/* Artwork: the brutalist frame, hard shadow. */}
        <div
          className="shrink-0"
          style={{
            width: 'min(72vw, 320px)',
            height: 'min(72vw, 320px)',
            border: '2px solid var(--border-strong)',
            borderRadius: 'var(--radius-brut)',
            boxShadow: 'var(--hard-shadow-lg)',
            overflow: 'hidden',
          }}
        >
          <Artwork track={current} size={320} rounded={0} />
        </div>

        {/* Title / artist */}
        <div className="w-full max-w-md text-center">
          <h2 className="truncate text-2xl font-extrabold tracking-tight">{current.title}</h2>
          <p className="mt-1 truncate text-sm" style={{ color: 'var(--text-secondary)' }}>
            {current.artist.name}
          </p>
        </div>

        {/* Progress */}
        <div className="w-full max-w-md">
          <input
            type="range"
            min={0}
            max={total || 1}
            step={1}
            value={Math.min(position, total || 1)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Seek"
            className="w-full"
            style={{ accentColor: 'var(--accent)' }}
          />
          <div className="flex justify-between font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <span>{formatDuration(position)}</span>
            <span>{formatDuration(total)}</span>
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center justify-center gap-6">
          <TransportButton onClick={() => void previous()} label="Previous">
            <Icon path="M196 64v128L100 128zM64 64h18v128H64z" />
          </TransportButton>
          <TransportButton onClick={() => void toggle()} label={isPlaying ? 'Pause' : 'Play'} big>
            {isLoading ? (
              <span
                className="inline-block size-6 animate-spin rounded-full"
                style={{ border: '3px solid rgb(255 255 255 / 0.35)', borderTopColor: 'rgb(255 255 255)' }}
                aria-hidden="true"
              />
            ) : (
              <Icon path={isPlaying ? 'M72 56h32v144H72zM152 56h32v144h-32z' : 'M112 56l96 72-96 72z'} />
            )}
          </TransportButton>
          <TransportButton onClick={() => void next()} label="Next">
            <Icon path="M60 64v128l96-64zM174 64h18v128h-18z" />
          </TransportButton>
        </div>

        {/* Lyrics / queue toggle */}
        <div className="w-full max-w-md">
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setShowLyrics((value) => !value)}
              className="brut-btn px-3 py-1.5 text-xs"
              data-variant={showLyrics ? 'accent' : 'plain'}
            >
              {showLyrics ? 'Hide lyrics' : 'Lyrics'}
            </button>
          </div>

          {showLyrics ? (
            lyrics && (lyrics.plain || lyrics.lines.length > 0) ? (
              <div
                className="max-h-64 overflow-y-auto whitespace-pre-line p-3 text-sm leading-relaxed"
                style={{ background: 'var(--bg-surface)', border: '2px solid var(--border)', borderRadius: 'var(--radius-brut)', color: 'var(--text-secondary)' }}
              >
                {lyrics.synced && lyrics.lines.length > 0
                  ? lyrics.lines.map((line, index) => (
                      <p key={index} className={line.text ? '' : 'h-2'}>
                        {line.text}
                      </p>
                    ))
                  : lyrics.plain}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No lyrics found for this track.
              </p>
            )
          ) : null}
        </div>

        {/* Up next: the queue minus what already played and the current row. */}
        {upcoming.length > 0 ? (
          <div className="w-full max-w-md">
            <p className="eyebrow mb-2">Up next</p>
            <ul className="flex flex-col gap-1.5">
              {upcoming.slice(0, 8).map((track) => (
                <li
                  key={track.id}
                  className="flex items-center gap-3 p-2"
                  style={{ background: 'var(--bg-surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                >
                  <Artwork track={track} size={36} rounded={6} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{track.title}</p>
                    <p className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {track.artist.name}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
