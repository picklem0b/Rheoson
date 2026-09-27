'use client';

import { useEffect, useRef, useState } from 'react';

import NowPlayingSheet from '@/components/player/NowPlayingSheet';
import { api, type Track } from '@/lib/api';
import { usePlayerStore, PLAYBACK_RATES, startDownload } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';
import { toast } from '@/store/toast.store';

/**
 * PlayerBar — the transport, at the bottom, always reachable.
 *
 * On mobile it is the layout the user asked for: **thumbnail, then title with
 * the artist underneath** (the Spotify arrangement), then favourite, play, and
 * an overflow menu. Tapping the body opens Now Playing; tapping a *control*
 * never does, which is handled by stopping propagation at each control rather
 * than by making the whole bar inert.
 *
 * The thin progress line above the bar is a seek control: dragging it is a
 * range input, so it works with a finger, a mouse and a keyboard alike.
 */

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 256 256" aria-hidden="true">
      <path
        d="M128 216S32 160 32 96a48 48 0 0 1 96-8 48 48 0 0 1 96 8c0 64-96 120-96 120z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="18"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayPause({ playing, loading }: { playing: boolean; loading: boolean }) {
  if (loading) {
    return (
      <span
        className="block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden="true"
      />
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 256 256" aria-hidden="true">
      {playing ? (
        <path d="M88 52h28v152H88zM140 52h28v152h-28z" fill="currentColor" />
      ) : (
        <path d="M80 48l136 80-136 80z" fill="currentColor" />
      )}
    </svg>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  accent = false,
  round = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  accent?: boolean;
  round?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`grid shrink-0 cursor-pointer place-items-center transition-opacity active:opacity-60 ${
        round ? 'size-10' : 'size-8'
      }`}
      style={
        round
          ? { background: 'var(--text-primary)', color: 'var(--bg-base)', borderRadius: 'var(--radius-full)' }
          : { color: accent ? 'var(--accent)' : 'var(--text-secondary)' }
      }
    >
      {children}
    </button>
  );
}

export default function PlayerBar() {
  const current = usePlayerStore((state) => state.current);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const rate = usePlayerStore((state) => state.rate);
  const toggle = usePlayerStore((state) => state.toggle);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const seek = usePlayerStore((state) => state.seek);
  const setRate = usePlayerStore((state) => state.setRate);
  const repeat = useQueueStore((state) => state.repeat);
  const setRepeat = useQueueStore((state) => state.setRepeat);
  const shuffle = useQueueStore((state) => state.shuffle);
  const toggleShuffle = useQueueStore((state) => state.toggleShuffle);

  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The heart follows the track, so a pending tap is stored with the id it
  // belongs to. Deriving it — rather than copying `current.isLiked` into state
  // on every change — means there is no effect to fall out of sync, and a slow
  // like on track A cannot paint on track B.
  const [likedOverride, setLikedOverride] = useState<{ id: string; liked: boolean } | null>(null);
  const liked = likedOverride && likedOverride.id === current?.id ? likedOverride.liked : Boolean(current?.isLiked);

  // Close the overflow menu on Escape or an outside tap.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  // Sleep timer: pause when it fires. Cancelled on unmount.
  useEffect(() => {
    if (sleepMinutes === null) return;
    const timer = window.setTimeout(
      () => {
        usePlayerStore.getState().toggle().catch(() => undefined);
        setSleepMinutes(null);
        toast.info('Sleep timer', 'Playback paused.');
      },
      sleepMinutes * 60_000,
    );
    return () => window.clearTimeout(timer);
  }, [sleepMinutes]);

  if (!current) return null;

  const toggleLike = async () => {
    if (likePending) return;
    setLikePending(true);
    const wanted = !liked;
    setLikedOverride({ id: current.id, liked: wanted });
    try {
      const response = wanted ? await api.like(current.id) : await api.unlike(current.id);
      setLikedOverride({ id: current.id, liked: response.liked });
    } catch {
      // An optimistic like that fails rolls back and says nothing: the next
      // surface that reads likes shows the truth, and a toast per tap would be
      // noise for a gesture the user can simply repeat.
      setLikedOverride({ id: current.id, liked: !wanted });
    } finally {
      setLikePending(false);
    }
  };

  const repeatLabel = repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat queue' : 'Repeat one';

  return (
    <>
      <NowPlayingSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <div className="fixed inset-x-0 bottom-0 z-40" style={{ paddingBottom: 'var(--safe-area-bottom)' }}>
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={Math.max(1, duration)}
        step={1}
        value={Math.min(position, duration || 0)}
        onChange={(event) => seek(Number(event.target.value))}
        className="block h-1.5 w-full cursor-pointer appearance-none"
        style={{ background: 'var(--border-strong)', accentColor: 'var(--accent)' }}
      />

      <div
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{
          background: 'var(--glass-bg)',
          borderTop: '2px solid var(--border-strong)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* The body is the open-the-player button: tapping what you can see
            opens the full screen; tapping a control never does. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Open Now Playing for ${current.title}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Artwork track={current} />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {current.title}
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
              {current.artist?.name}
            </p>
          </div>
        </button>

        <ControlButton label={liked ? 'Remove from favourites' : 'Add to favourites'} onClick={() => void toggleLike()} accent={liked}>
          <Heart filled={liked} />
        </ControlButton>

        <ControlButton label="Previous" onClick={() => void previous()}>
          <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true">
            <path d="M72 48v160M200 56v144L96 128z" fill="currentColor" />
          </svg>
        </ControlButton>

        <ControlButton label={isPlaying ? 'Pause' : 'Play'} onClick={() => void toggle()} round>
          <PlayPause playing={isPlaying} loading={isLoading} />
        </ControlButton>

        <ControlButton label="Next" onClick={() => void next()}>
          <svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true">
            <path d="M184 48v160M56 56v144l104-72z" fill="currentColor" />
          </svg>
        </ControlButton>

        <div ref={menuRef} className="relative">
          <ControlButton label="More options" onClick={() => setMenuOpen((open) => !open)}>
            <svg width="18" height="18" viewBox="0 0 256 256" aria-hidden="true">
              <circle cx="48" cy="128" r="18" fill="currentColor" />
              <circle cx="128" cy="128" r="18" fill="currentColor" />
              <circle cx="208" cy="128" r="18" fill="currentColor" />
            </svg>
          </ControlButton>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 bottom-12 w-56 p-1.5"
              style={{
                background: 'var(--bg-elevated)',
                border: '2px solid var(--border-strong)',
                borderRadius: 'var(--radius-brut)',
                boxShadow: 'var(--hard-shadow)',
              }}
            >
              <MenuItem
                label="Download"
                onSelect={() => {
                  setMenuOpen(false);
                  void startDownload(current);
                }}
              />
              <MenuGroup label="Playback settings" />
              <MenuItem
                label={`Speed — ${rate}×`}
                onSelect={() => {
                  const index = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
                  const nextRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
                  setRate(nextRate);
                }}
              />
              <MenuItem
                label={repeatLabel}
                onSelect={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
              />
              <MenuItem label={shuffle ? 'Shuffle on' : 'Shuffle off'} onSelect={() => toggleShuffle()} />
              <MenuGroup label="Sleep timer" />
              {[15, 30, 60].map((minutes) => (
                <MenuItem
                  key={minutes}
                  label={`${minutes} minutes`}
                  onSelect={() => {
                    setSleepMinutes(minutes);
                    setMenuOpen(false);
                    toast.info('Sleep timer', `Pausing in ${minutes} minutes.`);
                  }}
                />
              ))}
              {sleepMinutes !== null ? (
                <MenuItem
                  label="Cancel sleep timer"
                  onSelect={() => {
                    setSleepMinutes(null);
                    setMenuOpen(false);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </>
  );
}

function Artwork({ track }: { track: Track }) {
  return (
    <div
      className="size-11 shrink-0 overflow-hidden rounded-[10px]"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* A plain <img>, not next/image: artwork comes from the API origin and is
          served with its own cache headers, so the optimizer would only add a
          second hop. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img src={api.artworkUrl(track.id)} alt="" className="size-full object-cover" loading="lazy" />
    </div>
  );
}

function MenuItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="block w-full cursor-pointer rounded-[10px] px-3 py-2 text-left text-sm transition-colors"
      style={{ color: 'var(--text-primary)' }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--bg-overlay)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

function MenuGroup({ label }: { label: string }) {
  return (
    <p
      className="mt-1.5 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] uppercase"
      style={{ color: 'var(--text-muted)' }}
    >
      {label}
    </p>
  );
}
