'use client';

import { useEffect } from 'react';

import { api } from '@/lib/api';
import { usePlayerStore } from '@/store/player.store';

/**
 * Media Session — the OS-level transport.
 *
 * This is what makes the PWA a real music app rather than a web page: lock
 * screen controls, the headphone play/pause button, the car stereo, and the
 * "now playing" card all read from here. Without it, a phone locks the screen
 * and the music becomes uncontrollable, which is the single most-noticed thing
 * an installable music app can get wrong.
 *
 * Metadata is only set when it changes: reassigning artwork on every render
 * makes some platforms flicker the notification.
 */

type ActionHandler = (details: MediaSessionActionDetails) => void;

interface MediaSessionLike {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler: (action: MediaSessionAction, handler: ActionHandler | null) => void;
}

function sessionApi(): MediaSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { mediaSession?: MediaSessionLike }).mediaSession ?? null;
}

export function useMediaSession(): void {
  const current = usePlayerStore((state) => state.current);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);

  // Transport actions, registered once.
  useEffect(() => {
    const mediaSession = sessionApi();
    if (!mediaSession) return;
    const player = usePlayerStore.getState();

    const handlers: Array<[MediaSessionAction, ActionHandler]> = [
      ['play', () => void player.toggle()],
      ['pause', () => void player.toggle()],
      ['nexttrack', () => void usePlayerStore.getState().next()],
      ['previoustrack', () => void usePlayerStore.getState().previous()],
      [
        'seekto',
        (details) => {
          if (typeof details.seekTime === 'number') usePlayerStore.getState().seek(details.seekTime);
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported actions throw on older engines; skipping one is correct.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // Nothing to clean up.
        }
      }
    };
  }, []);

  // Playback state — cheap and always correct.
  useEffect(() => {
    const mediaSession = sessionApi();
    if (!mediaSession) return;
    mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Metadata, only when the track changes.
  useEffect(() => {
    const mediaSession = sessionApi();
    if (!mediaSession || typeof MediaMetadata === 'undefined') return;

    if (!current) {
      mediaSession.metadata = null;
      return;
    }

    mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist?.name ?? '',
      album: current.album?.title ?? '',
      artwork: [{ src: api.artworkUrl(current.id), sizes: '512x512', type: 'image/jpeg' }],
    });
  }, [current?.id, current?.title, current?.artist?.name, current?.album?.title, current]);

  // Position state drives the lock-screen scrubber. Written at most a few times
  // a second, and only when there is a real duration to report.
  useEffect(() => {
    const mediaSession = sessionApi() as (MediaSessionLike & { setPositionState?: (state: MediaPositionState) => void }) | null;
    if (!mediaSession?.setPositionState || !current || duration <= 0) return;

    try {
      mediaSession.setPositionState({
        duration,
        position: Math.max(0, Math.min(position, duration)),
        playbackRate: usePlayerStore.getState().rate,
      });
    } catch {
      // Out-of-range values throw on some engines; metadata already updated.
    }
  }, [position, duration, current]);
}
