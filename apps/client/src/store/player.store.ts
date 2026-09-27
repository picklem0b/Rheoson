'use client';

import { create } from 'zustand';

import { ApiError, api, type Track } from '@/lib/api';
import { applyFromStorage, resume as resumeEffects } from '@/lib/audioEffects';
import * as audioCache from '@/lib/audioCache';
import { nextIndex, previousIndex, useQueueStore } from './queue.store';
import { toast } from './toast.store';

/**
 * The player — one `<audio>` element, one store, no React re-render on a tick.
 *
 * Design rules, each one a lesson from the current stack:
 *
 * * **A module-level element, not one per component.** Two `<audio>` elements
 *   is how a track plays twice; the element is created once, lazily, and every
 *   action goes through it.
 * * **`currentTime` updates do not re-render the tree.** Position is written to
 *   the store but consumed only by the two components that display it (the
 *   player bar and the seek slider), and progress writes are throttled to
 *   roughly one per frame-second rather than on every `timeupdate` event.
 *   The local-cache-first path is what makes seeking instant.
 * * **A failure always produces a toast with the server's DCCNN code.** The
 *   stream endpoint answers with `{ error, code, detail }`; the store asks for
 *   that body directly, because an `<audio>` element's `error` event carries no
 *   information at all — which is exactly how "Download failed — YouTube
 *   refused this…" happened with no way to see the rest.
 * * **History is recorded once, honestly.** A play counts when the listener has
 *   actually heard it (half the track, or 30 s), not when the row appears.
 */

export type RepeatMode = 'off' | 'one' | 'all';

/** Playback rates offered by the speed control. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

/** A play is "listened to" after this much, or half the track. */
const COUNT_PLAY_AFTER_SECONDS = 30;

interface PlayerState {
  current: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** True once effects are routed through Web Audio (see audioEffects). */
  effectsActive: boolean;
  error: { code: string | null; message: string; detail: string | null } | null;

  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
  /** Called by the settings UI after an effect toggle. */
  syncEffects: (enable: boolean) => Promise<void>;
  stop: () => void;
}

let element: HTMLAudioElement | null = null;
let countedTrackId: string | null = null;
let progressGate = 0;

const VOLUME_KEY = 'rheoson-volume';

function readStoredVolume(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  const value = raw === null ? 1 : Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

/**
 * The single audio element. Created on first use so nothing runs at import
 * time on the server, and configured for streaming rather than eager loading.
 */
function audio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (element) return element;

  element = new window.Audio();
  element.preload = 'metadata';
  element.volume = readStoredVolume();
  // Note: `crossOrigin` is deliberately *not* set here. It is set only when the
  // listener opts into Web Audio effects, because setting it makes playback
  // fail outright when the API's CORS headers are not usable.
  return element;
}

/** Ask the API why a stream failed — an audio element never says. */
async function explainStreamFailure(trackId: string, signal?: AbortSignal): Promise<{ code: string | null; message: string; detail: string | null }> {
  try {
    const response = await fetch(api.streamUrl(trackId), {
      headers: { Range: 'bytes=0-0' },
      signal,
    });
    if (response.ok || response.status === 206) {
      // The bytes are fine: the failure was decoding or an unsupported codec.
      return { code: null, message: 'This track could not be played', detail: 'The audio could not be decoded in this browser.' };
    }
    const body = (await response.json()) as { error?: string; code?: string; detail?: string };
    return {
      code: body.code ?? null,
      message: body.error ?? 'Could not play this track',
      detail: body.detail ?? null,
    };
  } catch {
    return { code: 'SUP02', message: 'Could not reach the player service', detail: null };
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  current: null,
  isPlaying: false,
  isLoading: false,
  position: 0,
  duration: 0,
  volume: readStoredVolume(),
  muted: false,
  rate: 1,
  effectsActive: false,
  error: null,

  playTrack: async (track, queue) => {
    const queueState = useQueueStore.getState();
    if (queue && queue.length > 0) {
      const index = Math.max(0, queue.findIndex((item) => item.id === track.id));
      queueState.setQueue(queue, index);
    } else if (queueState.nowPlaying()?.id !== track.id) {
      queueState.setQueue([track], 0);
    }

    const media = audio();
    if (!media) return;

    set({ current: track, isLoading: true, error: null, position: 0, duration: track.duration ?? 0 });
    countedTrackId = null;
    progressGate = 0;

    // Local cache first: a track already on this device starts instantly and
    // costs nothing, which is the whole point of the cache.
    const cached = await audioCache.get(track.id);
    if (cached) {
      const blobUrl = URL.createObjectURL(new Blob([cached.bytes], { type: cached.contentType }));
      media.src = blobUrl;
    } else {
      media.src = api.streamUrl(track.id);
    }

    try {
      await media.play();
      set({ isPlaying: true, isLoading: false });
      void resumeEffects();
      // Mirror the cache in the background so the *next* play is instant.
      if (!cached) {
        void audioCache
          .fetchAndCache(api.streamUrl(track.id), track.id)
          .catch(() => undefined);
      }
    } catch {
      // `play()` rejects on both autoplay policy and load failure; the element's
      // own `error` handler distinguishes them and produces the toast.
      set({ isLoading: false });
    }
  },

  toggle: async () => {
    const media = audio();
    if (!media) return;

    if (!get().current) {
      const queued = useQueueStore.getState().items[0];
      if (queued) await get().playTrack(queued);
      return;
    }

    if (media.paused) {
      try {
        await media.play();
        set({ isPlaying: true });
      } catch {
        set({ isPlaying: false });
      }
    } else {
      media.pause();
      set({ isPlaying: false });
    }
  },

  next: async () => {
    const queueState = useQueueStore.getState();
    const index = nextIndex({ items: queueState.items, position: queueState.position, repeat: queueState.repeat });
    if (index === null) {
      // End of queue with repeat off is a normal stop, not an error.
      const media = audio();
      media?.pause();
      set({ isPlaying: false });
      return;
    }
    queueState.setPosition(index);
    const track = useQueueStore.getState().items[index];
    if (track) await get().playTrack(track);
  },

  previous: async () => {
    const media = audio();
    // The universal rule: a press after a few seconds restarts the track.
    if (media && media.currentTime > 3) {
      media.currentTime = 0;
      return;
    }

    const queueState = useQueueStore.getState();
    const index = previousIndex({ items: queueState.items, position: queueState.position, repeat: queueState.repeat });
    if (index === null) return;
    queueState.setPosition(index);
    const track = useQueueStore.getState().items[index];
    if (track) await get().playTrack(track);
  },

  seek: (seconds) => {
    const media = audio();
    if (!media || !Number.isFinite(seconds)) return;
    media.currentTime = Math.max(0, seconds);
    set({ position: Math.max(0, seconds) });
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const media = audio();
    if (media) media.volume = clamped;
    if (typeof window !== 'undefined') window.localStorage.setItem(VOLUME_KEY, String(clamped));
    set({ volume: clamped, muted: clamped === 0 });
  },

  toggleMute: () => {
    const media = audio();
    const muted = !get().muted;
    if (media) media.muted = muted;
    set({ muted });
  },

  setRate: (rate) => {
    const media = audio();
    if (media) {
      // Kept out of the effects graph deliberately: `preservesPitch` on the
      // element is what makes 1.5× sound like the same singer.
      media.playbackRate = rate;
      media.preservesPitch = true;
    }
    set({ rate });
  },

  syncEffects: async (enable) => {
    const media = audio();
    if (!media) return;

    const { sync } = await import('@/lib/audioEffects');
    const result = await sync(media, { enable });
    if (!result.ok) {
      // YEN01 is a real capability answer, not a crash: say so once, plainly.
      toast.error({
        title: 'Effects are not available on this device',
        code: result.code,
        detail: 'This browser does not expose the Web Audio graph the equalizer needs.',
      });
      return;
    }

    set({ effectsActive: enable });
    if (enable) {
      // Reload so the element picks up CORS mode; a silent failure here is
      // exactly what this opt-in design exists to avoid.
      const current = get().current;
      if (current) {
        media.load();
        applyFromStorage();
      }
    }
  },

  stop: () => {
    const media = audio();
    media?.pause();
    set({ isPlaying: false, current: null, position: 0 });
  },
}));

/** Wire the element's events once. Called from the provider component. */
export function bindAudioEvents(): () => void {
  const media = audio();
  if (!media) return () => undefined;

  const onTimeUpdate = () => {
    const now = Date.now();
    // Throttled: `timeupdate` fires ~4×/s per element, and every write here is
    // a render for the seek bar.
    if (now - progressGate < 250) return;
    progressGate = now;
    usePlayerStore.setState({ position: media.currentTime });

    const state = usePlayerStore.getState();
    const track = state.current;
    if (!track || countedTrackId === track.id) return;

    const heardEnough = media.currentTime >= COUNT_PLAY_AFTER_SECONDS || media.currentTime >= (media.duration || Infinity) / 2;
    if (heardEnough) {
      countedTrackId = track.id;
      // Fire-and-forget: a history write must never delay playback.
      void api.recordPlay(track.id, Math.round(media.currentTime)).catch(() => undefined);
    }
  };

  const onLoadedMetadata = () => {
    usePlayerStore.setState({ duration: Number.isFinite(media.duration) ? media.duration : 0, isLoading: false });
  };

  const onEnded = () => {
    const queueState = useQueueStore.getState();
    if (queueState.repeat === 'one') {
      media.currentTime = 0;
      void media.play();
      return;
    }
    void usePlayerStore.getState().next();
  };

  const onError = () => {
    const state = usePlayerStore.getState();
    const track = state.current;
    usePlayerStore.setState({ isPlaying: false, isLoading: false });
    if (!track) return;

    void explainStreamFailure(track.id).then((reason) => {
      usePlayerStore.setState({ error: reason });
      // The code is the point: it is what the ⓘ panel and a bug report need.
      toast.error({
        title: `Could not play “${track.title}”`,
        code: reason.code ?? undefined,
        detail: reason.detail ?? reason.message,
      });
    });
  };

  const onPlay = () => usePlayerStore.setState({ isPlaying: true });
  const onPause = () => usePlayerStore.setState({ isPlaying: false });
  const onWaiting = () => usePlayerStore.setState({ isLoading: true });
  const onPlaying = () => usePlayerStore.setState({ isLoading: false });

  media.addEventListener('timeupdate', onTimeUpdate);
  media.addEventListener('loadedmetadata', onLoadedMetadata);
  media.addEventListener('ended', onEnded);
  media.addEventListener('error', onError);
  media.addEventListener('play', onPlay);
  media.addEventListener('pause', onPause);
  media.addEventListener('waiting', onWaiting);
  media.addEventListener('playing', onPlaying);

  return () => {
    media.removeEventListener('timeupdate', onTimeUpdate);
    media.removeEventListener('loadedmetadata', onLoadedMetadata);
    media.removeEventListener('ended', onEnded);
    media.removeEventListener('error', onError);
    media.removeEventListener('play', onPlay);
    media.removeEventListener('pause', onPause);
    media.removeEventListener('waiting', onWaiting);
    media.removeEventListener('playing', onPlaying);
  };
}

/** The element itself, for components that need to attach effects or meters. */
export function audioElement(): HTMLAudioElement | null {
  return audio();
}

/** Start a download, reporting every outcome with a toast that carries a code. */
export async function startDownload(track: Track): Promise<void> {
  try {
    await api.download({ trackId: track.id, title: track.title });
    toast.success('Download started', `${track.title} — ${track.artist.name}`);
  } catch (cause) {
    const error = cause instanceof ApiError ? cause : null;
    toast.error({
      title: 'Download failed',
      code: error?.code ?? undefined,
      detail: error?.explanation,
      message: error?.message,
    });
  }
}
