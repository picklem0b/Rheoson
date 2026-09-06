import { useEffect, useRef, useCallback } from 'react';
import { Howl, Howler } from 'howler';
import { usePlayerStore } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';
import { tracksApi } from '@/api/tracks.api';
import { requestWakeLock, releaseWakeLock } from '@/lib/keepAwake';
import { updateStatusBarColor, resetStatusBarColor } from '@/lib/statusbar';
import { haptic } from '@/lib/haptics';
import { getLocalFileUrl } from '@/lib/localFs';
import { isNativePlatform } from '@/lib/capacitor';
import { ensureEffectsChain } from '@/lib/audioEffects';
import { prefetchQueue } from '@/lib/prefetch';
import { recommendationsApi } from '@/api/recommendations.api';
import { signalPlayComplete, signalRepeat, signalSkip } from '@/lib/signals';
import type { Track } from '@/types/track.types';

// ── Singleton Howl ────────────────────────────────────────────
// One instance shared across every component that calls usePlayer().
// This is what prevents the "double playing" bug — all play/pause/seek
// actions target the same Howl, never accidentally spawning a second one.

let _howl: Howl | null = null;
let _loadedId: string | null = null;
let _timer: number | null = null;
// BUG #25: Generation counter — incremented each time a new track is loaded.
// Howl callbacks from a previous generation are silently ignored, preventing
// race conditions where a stale onload/onplay clobbers the current track state.
let _generation = 0;

// Track which IDs have had recordPlay called this session
const _playedThisSession = new Set<string>();

// Guard so a single queue-exhaustion only triggers one autoplay fetch
let _autoplayInFlight = false;

// Settings → Audio → Autoplay (default on, matching streaming apps)
function _autoplayEnabled(): boolean {
    try {
        const raw = localStorage.getItem('rheoson-autoplay');
        return raw !== null ? (JSON.parse(raw) as boolean) : true;
    } catch {
        return true;
    }
}

/**
 * Queue exhausted → fetch similar tracks for the ended track, hydrate
 * them into full Tracks, and keep playing from the first suggestion.
 * Best-effort: any failure stops silently and playback just ends.
 */
async function _autoplayNext(endedTrack: { id: string; artist?: { name?: string } | null }) {
    if (_autoplayInFlight) return;
    _autoplayInFlight = true;
    try {
        const res = await recommendationsApi.getAutoplay(endedTrack.id, 10);
        const candidates = res?.tracks ?? [];
        if (!candidates.length) return;

        // Hydrate in parallel; skip failures, the ended track, and anything
        // already played this session so suggestions stay fresh.
        const settled = await Promise.allSettled(
            candidates.slice(0, 10).map((c) => tracksApi.getTrack(c.track_id))
        );
        const seen = new Set<string>([endedTrack.id]);
        const fresh: Track[] = [];
        for (const r of settled) {
            if (r.status !== 'fulfilled') continue;
            const t = r.value;
            if (!t?.id || seen.has(t.id) || _playedThisSession.has(t.id)) continue;
            seen.add(t.id);
            fresh.push(t);
            if (fresh.length >= 6) break;
        }
        if (!fresh.length) return;

        // First suggestion becomes current; the rest form the new queue.
        useQueueStore.getState().setQueue(fresh, 0);
        usePlayerStore.getState().setTrack(fresh[0]);

        window.dispatchEvent(
            new CustomEvent('rheoson:autoplay-started', {
                detail: { title: fresh[0].title, count: fresh.length },
            })
        );
    } catch {
        // Autoplay is best-effort — never let it break playback
    } finally {
        _autoplayInFlight = false;
    }
}

// ── Timer helpers ─────────────────────────────────────────────

function _stopTimer() {
    if (_timer !== null) {
        clearInterval(_timer);
        _timer = null;
    }
}

/**
 * Starts the 250ms playback tick.
 *  onTick    — fires every tick, drives the progress bar + live lyrics.
 *  onPersist — fires every ~5 s so savedProgress stays current even if the
 *              browser closes without a clean pause event (crash, force-quit,
 *              OS killing a backgrounded Android tab).
 */
function _startTimer(
    onTick: (s: number) => void,
    onPersist: (s: number) => void
) {
    _stopTimer();
    let tickCount = 0;
    _timer = window.setInterval(() => {
        if (!_howl?.playing()) return;
        const pos = _howl.seek() as number;
        onTick(pos);
        tickCount++;
        if (tickCount % 20 === 0) onPersist(pos); // ~5 s at 250 ms/tick
    }, 250);
}

function _destroy() {
    _stopTimer();
    // BUG #25: Increment generation so any in-flight callbacks from the old Howl
    // are silently ignored when they fire after we destroy.
    _generation++;
    if (_howl) {
        _howl.off();
        _howl.stop();
        _howl.unload();
        _howl = null;
    }
    _loadedId = null;
}

// ── Resolve stream URL ────────────────────────────────────────
// Three-tier URL resolution for maximum offline support:
//   1. If track has a filePath and we're on native → use file:// URI (zero network)
//   2. If track is downloaded → use backend /api/stream (works offline via service worker)
//   3. Otherwise → use backend /api/stream (yt-dlp pipe)

async function _resolveUrl(track: {
    id: string;
    filePath?: string;
    isDownloaded?: boolean;
}): Promise<string> {
    // Tier 1: Direct file access on native platform — zero network required
    if (isNativePlatform() && track.filePath) {
        const fileUrl = await getLocalFileUrl(track.filePath);
        if (fileUrl) return fileUrl;
    }

    // Tiers 2 & 3: Go through the backend stream endpoint
    return tracksApi.getStreamUrl(track.id);
}

// ── Hook ──────────────────────────────────────────────────────

export function usePlayer() {
    const {
        currentTrack,
        volume,
        isMuted,
        setPlaying,
        setLoading,
        setProgress,
        setDuration,
        setTrack,
        saveProgress
    } = usePlayerStore();
    const { next, prev } = useQueueStore();

    // Refs so Howl event callbacks (registered once) always call the latest
    // version of these functions without rebuilding the Howl instance.
    const tickRef = useRef((s: number) => setProgress(s));
    const persistRef = useRef((s: number) => saveProgress(s));
    const volRef = useRef(isMuted ? 0 : volume);
    const onEndRef = useRef<() => void>(() => {});

    useEffect(() => {
        tickRef.current = s => setProgress(s);
    }, [setProgress]);
    useEffect(() => {
        persistRef.current = s => saveProgress(s);
    }, [saveProgress]);
    useEffect(() => {
        volRef.current = isMuted ? 0 : volume;
    }, [volume, isMuted]);

    // ── onEnd handler ──────────────────────────────────────────
    useEffect(() => {
        onEndRef.current = () => {
            _stopTimer();
            setPlaying(false);
            setProgress(0);
            saveProgress(0);

            const state = usePlayerStore.getState();
            const { repeatMode, isShuffled } = state;
            const endedTrack = state.currentTrack;
            const endedArtist = endedTrack?.artist?.name;

            if (repeatMode === 'one') {
                // Replaying the same track is a repeat signal, not a skip
                signalRepeat(endedTrack?.id, endedArtist);
                _howl?.seek(0);
                _howl?.play();
                return;
            }

            // The track genuinely finished — feed the taste profiler
            signalPlayComplete(endedTrack?.id, endedArtist);

            const nextTrack = next(isShuffled);
            if (nextTrack) {
                setTrack(nextTrack);
                return;
            }

            if (repeatMode === 'all') {
                const { originalQueue } = useQueueStore.getState();
                if (originalQueue.length > 0) {
                    useQueueStore.getState().setQueue(originalQueue, 0);
                    setTrack(originalQueue[0]);
                    return; // repeat-all loops the playlist — no autoplay
                }
            }

            // Queue exhausted — keep the music going with similar tracks
            if (endedTrack && _autoplayEnabled()) {
                _autoplayNext(endedTrack);
            }
        };
    }, [next, setTrack, setPlaying, setProgress, saveProgress]);

    // ── loadAndPlay ────────────────────────────────────────────

    const loadAndPlay = useCallback(
        (
            trackId: string,
            forceRestart: boolean = false,
            autoplay: boolean = true,
            seekTo: number = 0
        ) => {
            // Same track already loaded — reuse the existing Howl.
            // This is the other half of the double-play prevention: if the track is
            // already loaded we never build a second instance.
            if (_loadedId === trackId && _howl && !forceRestart) {
                if (seekTo > 0) {
                    _howl.seek(seekTo);
                    setProgress(seekTo);
                } else {
                    _howl.seek(0);
                    setProgress(0);
                }
                if (autoplay && !_howl.playing()) _howl.play();
                return;
            }

            // Destroy the previous Howl — guarantees at most one active audio instance.
            _destroy();
            setLoading(true);
            setProgress(seekTo);
            setPlaying(false);
            setDuration(0);
            _loadedId = trackId;
            // BUG #25: Capture current generation — all Howl callbacks check this
            // to ensure they belong to the active track.
            const gen = _generation;

            // Resolve the URL asynchronously — may need to check local filesystem
            const track = usePlayerStore.getState().currentTrack;
            const urlPromise = track
                ? _resolveUrl(track)
                : Promise.resolve(tracksApi.getStreamUrl(trackId));

            urlPromise.then((url) => {
                // Generation may have moved on while resolving
                if (gen !== _generation) return;

            _howl = new Howl({
                src: [url],
                html5: true,
                format: ['mp3'],
                volume: volRef.current,
                preload: true,
                autoplay: false, // we control play after seeking so there's no audible jump

                onload() {
                    // BUG #25: Ignore if a newer track was loaded while this one was loading
                    if (gen !== _generation) return;
                    const dur = _howl?.duration() ?? 0;
                    if (dur > 0) setDuration(dur);
                    setLoading(false);
                    // Route audio through the DSP graph (EQ/bass/mono/pre-amp/normalise)
                    ensureEffectsChain();
                    if (seekTo > 0) {
                        _howl?.seek(seekTo);
                        setProgress(seekTo);
                    }
                    if (autoplay) _howl?.play();
                },

                onplay() {
                    // BUG #25: Ignore if generation has moved on
                    if (gen !== _generation) return;
                    // Ensure the DSP graph is attached (a rebuilt Howl has a new element)
                    ensureEffectsChain();
                    setPlaying(true);
                    setLoading(false);
                    const dur = _howl?.duration() ?? 0;
                    if (dur > 0) setDuration(dur);
                    _startTimer(
                        s => tickRef.current(s),
                        s => persistRef.current(s)
                    );

                    // Warm the next few queue tracks so skipping ahead or
                    // auto-advance starts from an already-buffered file
                    const upcoming = useQueueStore
                        .getState()
                        .queue.slice(0, 3);
                    if (upcoming.length > 0) {
                        prefetchQueue(upcoming.map(t => t.id), 3);
                    }

                    // Record play history (once per session per track)
                    if (!_playedThisSession.has(trackId)) {
                        _playedThisSession.add(trackId);
                        tracksApi.recordPlay(trackId).catch(() => {});
                    }

                    // Mobile enhancements: wake lock + status bar + haptic
                    requestWakeLock();
                    haptic('light');
                    const artworkUrl = usePlayerStore.getState().currentTrack?.artworkUrl;
                    if (artworkUrl) updateStatusBarColor(artworkUrl, trackId);
                },

                // Pause saves the exact position so resume picks up from the same spot.
                // This is the mechanism behind "pause on Android, come back later, tap
                // play — it continues from where you left off."
                onpause() {
                    setPlaying(false);
                    _stopTimer();
                    const pos = _howl?.seek() as number | undefined;
                    if (pos != null) saveProgress(pos);
                    // Release wake lock when paused — screen can sleep
                    releaseWakeLock();
                    haptic('light');
                },

                onstop() {
                    setPlaying(false);
                    _stopTimer();
                    setProgress(0);
                    saveProgress(0);
                    releaseWakeLock();
                    resetStatusBarColor();
                },

                onend() {
                    onEndRef.current();
                },

                onloaderror(_id, err) {
                    console.error('[Rheoson] load error', { trackId, url, err });
                    setLoading(false);
                    setPlaying(false);
                    _loadedId = null;
                    // Dispatch event so UI can show retry toast
                    let message = 'Could not load this track';
                    const errStr = String(err);
                    if (errStr.includes('404') || errStr.includes('Not Found')) {
                        message = 'Track not found — it may have been removed';
                    } else if (errStr.includes('403') || errStr.includes('Forbidden')) {
                        message = 'Access denied — this track may be region-locked';
                    } else if (errStr.includes('Network') || errStr.includes('Failed to fetch')) {
                        message = 'Network error — check your connection';
                    } else if (errStr.includes('decode') || errStr.includes('DECODE')) {
                        message = 'Audio format not supported — trying alternative stream…';
                    }
                    window.dispatchEvent(
                        new CustomEvent('rheoson:play-error', {
                            detail: { trackId, error: message, originalError: String(err) },
                        })
                    );
                },

                onplayerror(_id, err) {
                    console.error('[Rheoson] play error', { trackId, err });
                    // BUG FIX: Auto-recover from play errors by destroying
                    // the current Howl and rebuilding from saved position.
                    // This fixes the broken play button after a stream error.
                    const savedPos = usePlayerStore.getState().savedProgress;
                    // Try AudioContext resume first (Android user-gesture lock)
                    if (Howler.ctx?.state === 'suspended') {
                        Howler.ctx
                            .resume()
                            .then(() => {
                                if (gen === _generation && _howl) {
                                    _howl.play();
                                } else {
                                    // Generation moved on — rebuild
                                    _destroy();
                                    setLoading(false);
                                }
                            })
                            .catch(() => {
                                // AudioContext resume failed — rebuild Howl
                                _destroy();
                                setLoading(false);
                                _loadedId = null;
                                window.dispatchEvent(
                                    new CustomEvent('rheoson:play-error', {
                                        detail: { trackId, error: 'Playback interrupted — tap to retry', savedPos },
                                    })
                                );
                            });
                        return;
                    }
                    // Non-AudioContext error — try one rebuild from saved position
                    _destroy();
                    setLoading(false);
                    _loadedId = null;
                    let message = 'Playback error — tap to retry';
                    const errStr = String(err);
                    if (errStr.includes('decode') || errStr.includes('DECODE')) {
                        message = 'Audio decode error — trying alternative stream…';
                    } else if (errStr.includes('Network') || errStr.includes('Failed to fetch')) {
                        message = 'Network error — check your connection';
                    } else if (errStr.includes('404') || errStr.includes('Not Found')) {
                        message = 'Track no longer available';
                    }
                    // Dispatch event so UI can show retry toast
                    window.dispatchEvent(
                        new CustomEvent('rheoson:play-error', {
                            detail: { trackId, error: message, savedPos },
                        })
                    );
                }
            });
            }).catch(() => {
                // URL resolution failed — load error is already handled above
                setLoading(false);
                _loadedId = null;
            });
        },
        [] // eslint-disable-line react-hooks/exhaustive-deps -- stable: all state accessed via refs or store.getState()
    );

    // ── Resume after page reload ───────────────────────────────
    // If currentTrack is rehydrated from localStorage but no Howl exists yet,
    // reconstruct it silently at the saved position so the player is instantly
    // ready when the user taps play — no starting from 0:00.

    useEffect(() => {
        if (!currentTrack?.id) return;
        if (_loadedId === currentTrack.id) return;

        const { savedProgress } = usePlayerStore.getState();
        loadAndPlay(currentTrack.id, false, false, savedProgress);

        return () => _stopTimer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTrack?.id]);

    // ── Same-track restart event ───────────────────────────────

    useEffect(() => {
        const handler = () => {
            if (currentTrack?.id) loadAndPlay(currentTrack.id, true, true, 0);
        };
        window.addEventListener('rheoson:restart-track', handler);
        return () =>
            window.removeEventListener('rheoson:restart-track', handler);
    }, [currentTrack?.id, loadAndPlay]);

    // ── Volume sync ────────────────────────────────────────────

    useEffect(() => {
        _howl?.volume(isMuted ? 0 : volume);
    }, [volume, isMuted]);

    // ── Cleanup on unmount ─────────────────────────────────────

    useEffect(() => () => _stopTimer(), []);

    // ── Public API ─────────────────────────────────────────────

    const play = useCallback(() => {
        if (_howl && _loadedId != null) {
            _howl.play();
        } else if (currentTrack) {
            const { savedProgress } = usePlayerStore.getState();
            loadAndPlay(currentTrack.id, false, true, savedProgress);
        }
    }, [currentTrack, loadAndPlay]);

    const pause = useCallback(() => {
        _howl?.pause();
    }, []);

    const togglePlay = useCallback(() => {
        if (_howl?.playing()) {
            _howl.pause();
        } else if (_howl && _loadedId != null) {
            _howl.play();
        } else if (currentTrack) {
            // No usable Howl (never loaded, or destroyed after an error) —
            // rebuild it and start playing from the saved position.
            const { savedProgress } = usePlayerStore.getState();
            loadAndPlay(currentTrack.id, true, true, savedProgress);
        }
    }, [currentTrack, loadAndPlay]);

    const seek = useCallback(
        (s: number) => {
            _howl?.seek(s);
            setProgress(s);
            saveProgress(s);
        },
        [setProgress, saveProgress]
    );

    const resume = useCallback(() => {
        if (!currentTrack) return;
        const { savedProgress } = usePlayerStore.getState();
        if (_howl && _loadedId === currentTrack.id) {
            if (savedProgress > 0) {
                _howl.seek(savedProgress);
                setProgress(savedProgress);
            }
            _howl.play();
        } else {
            loadAndPlay(currentTrack.id, false, true, savedProgress);
        }
    }, [currentTrack, loadAndPlay, setProgress]);

    const restartCurrent = useCallback(() => {
        if (currentTrack) loadAndPlay(currentTrack.id, true, true, 0);
    }, [currentTrack, loadAndPlay]);

    const skipNext = useCallback(() => {
        const state = usePlayerStore.getState();
        const t = next(state.isShuffled);
        if (t) {
            signalSkip(state.currentTrack?.id, state.progress, state.currentTrack?.artist?.name);
            setTrack(t);
            haptic('medium');
        }
    }, [next, setTrack]);

    const skipPrev = useCallback(() => {
        const state = usePlayerStore.getState();
        if (state.progress > 3) {
            seek(0);
            haptic('light');
            return;
        }
        const t = prev();
        if (t) {
            signalSkip(state.currentTrack?.id, state.progress, state.currentTrack?.artist?.name);
            setTrack(t);
            haptic('medium');
        }
    }, [prev, seek, setTrack]);

    return {
        play,
        pause,
        togglePlay,
        seek,
        resume,
        skipNext,
        skipPrev,
        restartCurrent
    };
}
