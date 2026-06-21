import { useEffect, useRef, useCallback } from 'react'
import { Howl, Howler } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'

// ── Module-level singleton ────────────────────────────────────
// Only one Howl instance ever exists, shared across every component that
// calls usePlayer(). This is what stops the "double playing song" bug —
// every play/pause/seek action operates on this single shared instance
// instead of each component accidentally creating its own.

let _howl:     Howl   | null = null
let _loadedId: string | null = null
let _timer:    number | null = null

// Tracks which IDs we've called recordPlay for this session
const _playedThisSession = new Set<string>()

// ── Timer helpers ─────────────────────────────────────────────

function _stopTimer() {
  if (_timer !== null) { clearInterval(_timer); _timer = null }
}

/**
 * Starts the 250ms playback tick.
 *  - `onTick`    fires every tick — drives the UI progress bar + live lyrics.
 *  - `onPersist` fires roughly every 5 seconds (a safety net) so the saved
 *    position in localStorage stays roughly current even if the browser
 *    closes without firing a clean pause/stop event (e.g. force-quit,
 *    crash, or the OS killing a backgrounded tab on mobile).
 */
function _startTimer(onTick: (s: number) => void, onPersist: (s: number) => void) {
  _stopTimer()
  let tickCount = 0
  _timer = window.setInterval(() => {
    if (!_howl?.playing()) return
    const pos = _howl.seek() as number
    onTick(pos)
    tickCount++
    if (tickCount % 20 === 0) onPersist(pos) // ~5s at 250ms per tick
  }, 250)
}

function _destroy() {
  _stopTimer()
  if (_howl) { _howl.off(); _howl.stop(); _howl.unload(); _howl = null }
  _loadedId = null
}

// ── Hook ──────────────────────────────────────────────────────

export function usePlayer() {
  const {
    currentTrack, volume, isMuted,
    setPlaying, setLoading, setProgress, setDuration, setTrack,
    saveProgress,
  } = usePlayerStore()
  const { next, prev } = useQueueStore()

  // Refs so the Howl event callbacks (defined once, never recreated) always
  // call the LATEST version of these functions without needing to rebuild
  // the whole Howl instance every time a dependency changes.
  const tickRef    = useRef((s: number) => setProgress(s))
  const persistRef = useRef((s: number) => saveProgress(s))
  const volRef      = useRef(isMuted ? 0 : volume)
  const onEndRef    = useRef<() => void>(() => {})

  useEffect(() => { tickRef.current    = (s) => setProgress(s)  }, [setProgress])
  useEffect(() => { persistRef.current = (s) => saveProgress(s) }, [saveProgress])
  useEffect(() => { volRef.current     = isMuted ? 0 : volume   }, [volume, isMuted])

  // ── onEnd handler — kept up to date via ref ────────────────
  useEffect(() => {
    onEndRef.current = () => {
      _stopTimer()
      setPlaying(false)
      setProgress(0)
      saveProgress(0)

      const { repeatMode, isShuffled } = usePlayerStore.getState()

      if (repeatMode === 'one') {
        _howl?.seek(0)
        _howl?.play()
        return
      }

      const nextTrack = next(isShuffled)
      if (nextTrack) { setTrack(nextTrack); return }

      if (repeatMode === 'all') {
        const { originalQueue } = useQueueStore.getState()
        if (originalQueue.length > 0) {
          useQueueStore.getState().setQueue(originalQueue, 0)
          setTrack(originalQueue[0])
        }
      }
    }
  }, [next, setTrack, setPlaying, setProgress, saveProgress])

  // ── loadAndPlay ────────────────────────────────────────────

  const loadAndPlay = useCallback((
    trackId:      string,
    forceRestart: boolean = false,
    autoplay:     boolean = true,
    seekTo:       number  = 0,
  ) => {
    // Same track already loaded — just seek/play, no need to rebuild Howl.
    // This is the other half of the "double playing" fix: if a track is
    // already loaded, we reuse it instead of creating a second instance.
    if (_loadedId === trackId && _howl && !forceRestart) {
      if (seekTo > 0) { _howl.seek(seekTo); setProgress(seekTo) }
      else            { _howl.seek(0);      setProgress(0) }
      if (autoplay && !_howl.playing()) _howl.play()
      return
    }

    // Destroy any previous Howl before creating a new one — guarantees
    // there is never more than one active audio instance at a time.
    _destroy()
    setLoading(true)
    setProgress(seekTo)
    setPlaying(false)
    setDuration(0)
    _loadedId = trackId

    const url = tracksApi.getStreamUrl(trackId)

    _howl = new Howl({
      src:      [url],
      html5:    true,
      format:   ['mp3'],
      volume:   volRef.current,
      preload:  true,
      autoplay: false, // we control play manually so we can seek first

      onload() {
        const dur = _howl?.duration() ?? 0
        if (dur > 0) setDuration(dur)
        setLoading(false)

        // Seek to the requested position (e.g. resuming after reload)
        // before playback actually starts, so there's no audible jump.
        if (seekTo > 0) {
          _howl?.seek(seekTo)
          setProgress(seekTo)
        }

        if (autoplay) _howl?.play()
      },

      onplay() {
        setPlaying(true)
        setLoading(false)
        const dur = _howl?.duration() ?? 0
        if (dur > 0) setDuration(dur)
        _startTimer(
          (s) => tickRef.current(s),
          (s) => persistRef.current(s),
        )
      },

      // ── Pause → save to localStorage ──────────────────────
      // This is the core of "pause saves position, unpause continues":
      // every pause writes the exact playback position to the persisted
      // player store (savedProgress), so even if the app is closed and
      // reopened later, resuming picks up from exactly here.
      onpause() {
        setPlaying(false)
        _stopTimer()
        const pos = _howl?.seek() as number | undefined
        if (pos != null) saveProgress(pos)
      },

      onstop() {
        setPlaying(false)
        _stopTimer()
        setProgress(0)
        saveProgress(0)
      },

      onend() { onEndRef.current() },

      onloaderror(_id, err) {
        console.error('[Shulker] load error', { trackId, url, err })
        setLoading(false)
        setPlaying(false)
        _loadedId = null
      },

      onplayerror(_id, err) {
        console.error('[Shulker] play error', err)
        if (Howler.ctx?.state === 'suspended') {
          Howler.ctx.resume().then(() => _howl?.play()).catch(() => {})
        }
      },
    })
  }, []) // stable — all state accessed via refs or store getState()

  // ── Resume after page reload ───────────────────────────────
  // If currentTrack exists (rehydrated from localStorage) but no Howl has
  // been built yet this session, reconstruct it silently — paused, seeked
  // to the saved position — so the player is ready the instant the user
  // taps play, instead of starting over from 0:00.

  useEffect(() => {
    if (!currentTrack?.id) return
    if (_loadedId === currentTrack.id) return // already loaded this session

    const { savedProgress } = usePlayerStore.getState()
    loadAndPlay(currentTrack.id, false, false, savedProgress)

    return () => _stopTimer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id])

  // ── Same-track restart ─────────────────────────────────────

  useEffect(() => {
    const handler = () => {
      if (currentTrack?.id) loadAndPlay(currentTrack.id, true, true, 0)
    }
    window.addEventListener('shulker:restart-track', handler)
    return () => window.removeEventListener('shulker:restart-track', handler)
  }, [currentTrack?.id, loadAndPlay])

  // ── Volume sync ────────────────────────────────────────────

  useEffect(() => {
    _howl?.volume(isMuted ? 0 : volume)
  }, [volume, isMuted])

  // ── Cleanup ────────────────────────────────────────────────

  useEffect(() => () => _stopTimer(), [])

  // ── Public API ─────────────────────────────────────────────

  const play = useCallback(() => {
    if (_howl) {
      _howl.play()
    } else if (currentTrack) {
      const { savedProgress } = usePlayerStore.getState()
      loadAndPlay(currentTrack.id, false, true, savedProgress)
    }
  }, [currentTrack, loadAndPlay])

  const pause = useCallback(() => { _howl?.pause() }, [])

  const togglePlay = useCallback(() => {
    if (_howl?.playing()) {
      _howl.pause() // triggers onpause → saves progress automatically
    } else if (_howl) {
      _howl.play()  // resumes from wherever Howler's internal position is
    } else if (currentTrack) {
      // No Howl built yet this session (e.g. straight after a reload) —
      // build one now and seek to the last saved position.
      const { savedProgress } = usePlayerStore.getState()
      loadAndPlay(currentTrack.id, false, true, savedProgress)
    }
  }, [currentTrack, loadAndPlay])

  /**
   * seek — jump playback to an exact position, in seconds.
   * Used by the progress bar drag handle AND by tapping a lyric line.
   * Also persists immediately, so a seek followed by closing the app
   * resumes from the new position next time, not the old one.
   */
  const seek = useCallback((s: number) => {
    _howl?.seek(s)
    setProgress(s)
    saveProgress(s)
  }, [setProgress, saveProgress])

  /**
   * resume — explicitly reconstructs the Howl at the saved position and
   * starts playing. Useful for a dedicated "Resume" button or calling on
   * app focus after being backgrounded for a long time.
   */
  const resume = useCallback(() => {
    if (!currentTrack) return
    const { savedProgress } = usePlayerStore.getState()

    if (_howl && _loadedId === currentTrack.id) {
      if (savedProgress > 0) { _howl.seek(savedProgress); setProgress(savedProgress) }
      _howl.play()
    } else {
      loadAndPlay(currentTrack.id, false, true, savedProgress)
    }
  }, [currentTrack, loadAndPlay, setProgress])

  const restartCurrent = useCallback(() => {
    if (currentTrack) loadAndPlay(currentTrack.id, true, true, 0)
  }, [currentTrack, loadAndPlay])

  const skipNext = useCallback(() => {
    const { isShuffled } = usePlayerStore.getState()
    const t = next(isShuffled)
    if (t) setTrack(t)
  }, [next, setTrack])

  const skipPrev = useCallback(() => {
    const { progress } = usePlayerStore.getState()
    if (progress > 3) { seek(0); return }
    const t = prev()
    if (t) setTrack(t)
  }, [prev, seek, setTrack])

  return { play, pause, togglePlay, seek, resume, skipNext, skipPrev, restartCurrent }
}