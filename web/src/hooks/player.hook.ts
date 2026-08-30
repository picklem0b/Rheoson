import { useEffect, useRef, useCallback } from 'react';
import { Howl, Howler } from 'howler';
import { usePlayerStore } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';
import { tracksApi } from '@/api/tracks.api';

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
// Prefer the local /api/stream URL, which the backend will serve from disk
// if the file is downloaded, or fall back to the yt-dlp pipe.
// This is the core of offline playback: downloaded tracks play from disk
// at full quality without any network round-trip to YouTube.

function _resolveUrl(track: {
    id: string;
    filePath?: string;
    isDownloaded?: boolean;
}): string {
    // The backend stream endpoint handles the local-vs-yt-dlp decision itself,
    // but we can also build the URL from the track's own streamUrl/filePath.
    // Always go through the API — the backend cache invalidation handles the rest.
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

            const { repeatMode, isShuffled } = usePlayerStore.getState();

            if (repeatMode === 'one') {
                _howl?.seek(0);
                _howl?.play();
                return;
            }

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
                }
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

            // Resolve the URL. The backend /stream endpoint checks the local file cache
            // first, so downloaded tracks play from disk without hitting YouTube.
            const track = usePlayerStore.getState().currentTrack;
            const url = track
                ? _resolveUrl(track)
                : tracksApi.getStreamUrl(trackId);

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
                    if (seekTo > 0) {
                        _howl?.seek(seekTo);
                        setProgress(seekTo);
                    }
                    if (autoplay) _howl?.play();
                },

                onplay() {
                    // BUG #25: Ignore if generation has moved on
                    if (gen !== _generation) return;
                    setPlaying(true);
                    setLoading(false);
                    const dur = _howl?.duration() ?? 0;
                    if (dur > 0) setDuration(dur);
                    _startTimer(
                        s => tickRef.current(s),
                        s => persistRef.current(s)
                    );

                    // Record play history (once per session per track)
                    if (!_playedThisSession.has(trackId)) {
                        _playedThisSession.add(trackId);
                        tracksApi.recordPlay(trackId).catch(() => {});
                    }
                },

                // Pause saves the exact position so resume picks up from the same spot.
                // This is the mechanism behind "pause on Android, come back later, tap
                // play — it continues from where you left off."
                onpause() {
                    setPlaying(false);
                    _stopTimer();
                    const pos = _howl?.seek() as number | undefined;
                    if (pos != null) saveProgress(pos);
                },

                onstop() {
                    setPlaying(false);
                    _stopTimer();
                    setProgress(0);
                    saveProgress(0);
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
                    window.dispatchEvent(
                        new CustomEvent('rheoson:play-error', {
                            detail: { trackId, error: String(err) },
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
                                        detail: { trackId, error: String(err) },
                                    })
                                );
                            });
                        return;
                    }
                    // Non-AudioContext error — try one rebuild from saved position
                    _destroy();
                    setLoading(false);
                    _loadedId = null;
                    // Dispatch event so UI can show retry toast
                    window.dispatchEvent(
                        new CustomEvent('rheoson:play-error', {
                            detail: { trackId, error: String(err), savedPos },
                        })
                    );
                }
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
        const { isShuffled } = usePlayerStore.getState();
        const t = next(isShuffled);
        if (t) setTrack(t);
    }, [next, setTrack]);

    const skipPrev = useCallback(() => {
        const { progress } = usePlayerStore.getState();
        if (progress > 3) {
            seek(0);
            return;
        }
        const t = prev();
        if (t) setTrack(t);
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
