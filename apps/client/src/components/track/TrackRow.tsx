'use client';

import { api, type Track } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { useFavouritesStore } from '@/store/favourites.store';
import { startDownload, usePlayerStore } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';

/**
 * TrackRow and TrackCard — the two shapes a track takes.
 *
 * Both are presentational: playing is a call into the player store, and every
 * surface that lists tracks uses the same components, so a behaviour added once
 * (a download action, a downloaded badge) appears everywhere instead of on the
 * one screen where it was written.
 */

export function Artwork({ track, size = 44, rounded = 10 }: { track: Track; size?: number; rounded?: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{ width: size, height: size, borderRadius: rounded, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- artwork is served by the API with its own cache headers */}
      <img src={api.artworkUrl(track.id)} alt="" width={size} height={size} className="size-full object-cover" loading="lazy" />
    </div>
  );
}

export default function TrackRow({
  track,
  queue,
  showAlbum = false,
  footer,
}: {
  track: Track;
  /** The list this row belongs to — the queue it plays within. */
  queue?: Track[];
  showAlbum?: boolean;
  footer?: React.ReactNode;
}) {
  const current = usePlayerStore((state) => state.current);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const enqueueNext = useQueueStore((state) => state.enqueueNext);
  const toggleFavourite = useFavouritesStore((state) => state.toggle);
  // A session-local change wins over the snapshot the list was fetched with.
  const liked = useFavouritesStore((state) => state.liked[track.id]) ?? Boolean(track.isLiked);
  const isCurrent = current?.id === track.id;

  return (
    <div
      className="group flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors"
      style={{ background: isCurrent ? 'var(--accent-subtle)' : 'transparent' }}
      onMouseEnter={(event) => {
        if (!isCurrent) event.currentTarget.style.background = 'var(--bg-surface)';
      }}
      onMouseLeave={(event) => {
        if (!isCurrent) event.currentTarget.style.background = 'transparent';
      }}
    >
      <button
        type="button"
        onClick={() => void playTrack(track, queue)}
        aria-label={`Play ${track.title}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
      >
        <Artwork track={track} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium" style={{ color: isCurrent ? 'var(--accent-bright)' : 'var(--text-primary)' }}>
              {track.title}
            </span>
            {track.isDownloaded ? (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
                style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}
                title="Downloaded"
              >
                SAVED
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
            {track.artist?.name}
            {showAlbum && track.album?.title ? ` · ${track.album.title}` : ''}
          </span>
        </span>
      </button>

      <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {track.duration ? formatDuration(track.duration) : ''}
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <IconAction
          label={liked ? `Remove ${track.title} from favourites` : `Add ${track.title} to favourites`}
          onClick={() => void toggleFavourite(track.id, track.title)}
          path="M128 216S28 160 28 92a52 52 0 0 1 100-20 52 52 0 0 1 100 20c0 68-100 124-100 124z"
          filled={liked}
          tone={liked ? 'accent' : 'muted'}
        />
        <IconAction
          label={`Play ${track.title} next`}
          onClick={() => enqueueNext(track)}
          path="M56 56v144l104-72zM184 48v160"
        />
        {track.isDownloaded ? null : (
          <IconAction
            label={`Download ${track.title}`}
            onClick={() => void startDownload(track)}
            path="M128 48v96m0 0l-32-32m32 32l32-32M64 200h128"
          />
        )}
        {footer}
      </span>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  path,
  filled = false,
  tone = 'muted',
}: {
  label: string;
  onClick: () => void;
  path: string;
  /** Filled icons read as "on" — a filled heart is a favourite. */
  filled?: boolean;
  tone?: 'muted' | 'accent';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={filled || undefined}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="grid size-8 cursor-pointer place-items-center rounded-full transition-opacity active:opacity-60"
      style={{ color: tone === 'accent' ? 'var(--accent-bright)' : 'var(--text-secondary)' }}
    >
      <svg width="14" height="14" viewBox="0 0 256 256" aria-hidden="true">
        <path d={path} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** The grid shape: artwork over a title, used for albums and playlists. */
export function TrackCard({
  title,
  subtitle,
  artworkUrl,
  onClick,
  badge,
}: {
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  onClick?: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-[14px] p-2.5 text-left transition-colors"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="aspect-square w-full overflow-hidden rounded-[10px]" style={{ background: 'var(--bg-elevated)' }}>
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- API-served artwork
          <img src={artworkUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="grid size-full place-items-center text-lg font-semibold" style={{ color: 'var(--text-muted)' }}>
            {title.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </p>
      {subtitle ? (
        <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>
      ) : null}
      {badge}
    </button>
  );
}

/** A labelled section with an optional "see all" link. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 first:mt-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="cursor-pointer text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {action.label} ›
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
