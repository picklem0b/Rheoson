import {
  forwardRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';

import { cn } from '@/lib/utils';

import { Pause, Play } from 'lucide-react';

export type PlaylistTrack = {
  title: string;
  artist: string;
  duration: string;
};

export type MusicPlaylistCardProps = Readonly<
  {
    coverImage?: string;
    playlistType?: string;
    title?: string;
    songCount?: string;
    totalDuration?: string;
    tracks?: PlaylistTrack[];
    /** Fired when a row is tapped — wire this to real playback. */
    onTrackClick?: (index: number) => void;
  } & ComponentPropsWithoutRef<'div'>
>;

/**
 * Compact playlist card: cover, metadata and a preview of the first tracks.
 *
 * Restyled onto the app's dark surface tokens (it shipped with light-theme
 * colours) and given an `onTrackClick` hook so the play affordance can drive
 * the real queue instead of only toggling a local icon.
 */
export const MusicPlaylistCard = forwardRef<
  HTMLDivElement,
  MusicPlaylistCardProps
>(
  (
    {
      className,
      coverImage = '/assets/logo.png',
      playlistType = 'Playlist',
      title = 'Playlist',
      songCount = '0 songs',
      totalDuration = '0m',
      tracks = [],
      onTrackClick,
      ...props
    },
    ref
  ) => {
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);

    const selectTrack = (index: number) => {
      setPlayingIndex((prev) => (prev === index ? null : index));
      onTrackClick?.(index);
    };

    return (
      <div
        ref={ref}
        data-slot='music-playlist-card'
        className={cn(
          'w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] font-sans shadow-lg',
          className
        )}
        {...props}
      >
        <div
          data-slot='music-playlist-card-header'
          className='flex gap-3 p-4'
        >
          <div
            data-slot='music-playlist-card-cover'
            className='relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--bg-elevated)] shadow-sm'
          >
            <img
              src={coverImage}
              alt={title}
              loading='lazy'
              decoding='async'
              className='absolute inset-0 h-full w-full object-cover'
            />
          </div>

          <div data-slot='music-playlist-card-info' className='min-w-0'>
            <p className='font-mono text-[10px] tracking-wider text-[var(--text-muted)] uppercase'>
              {playlistType}
            </p>

            <h3 className='mt-0.5 truncate text-sm font-semibold text-[var(--text-primary)]'>
              {title}
            </h3>

            <p className='mt-0.5 text-[11px] text-[var(--text-secondary)]'>
              {songCount} · {totalDuration}
            </p>
          </div>
        </div>

        <div
          data-slot='music-playlist-card-tracks'
          className='divide-y divide-[var(--border)]/40'
        >
          {tracks.map((track, index) => {
            const isPlaying = playingIndex === index;

            return (
              <button
                key={`${track.title}-${track.artist}-${index}`}
                type='button'
                onClick={() => selectTrack(index)}
                data-slot='music-playlist-card-track'
                className={cn(
                  'group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  isPlaying
                    ? 'bg-[var(--accent-subtle)]'
                    : 'hover:bg-[var(--bg-elevated)]'
                )}
              >
                <span
                  className={cn(
                    'w-4 font-mono text-[10px] text-[var(--text-muted)]',
                    isPlaying ? 'hidden' : 'group-hover:hidden'
                  )}
                >
                  {index + 1}
                </span>

                <span
                  className={cn(
                    'w-4 text-[10px] text-[var(--accent)]',
                    isPlaying ? 'block' : 'hidden group-hover:block'
                  )}
                >
                  {isPlaying ? (
                    <Pause size={12} fill='currentColor' />
                  ) : (
                    <Play size={12} fill='currentColor' />
                  )}
                </span>

                <div className='min-w-0 flex-1'>
                  <p
                    className={cn(
                      'truncate text-xs font-medium',
                      isPlaying
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-primary)]'
                    )}
                  >
                    {track.title}
                  </p>

                  <p className='truncate text-[10px] text-[var(--text-muted)]'>
                    {track.artist}
                  </p>
                </div>

                <span className='font-mono text-[10px] text-[var(--text-muted)]'>
                  {track.duration}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

MusicPlaylistCard.displayName = 'MusicPlaylistCard';

export default MusicPlaylistCard;
