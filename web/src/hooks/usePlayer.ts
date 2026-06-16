import { useEffect, useRef, useCallback } from 'react'
import { Howl, Howler } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'

// ── Module-level singleton ────────────────────────────────────

let _howl:     Howl   | null = null
let _loadedId: string | null = null
let _timer:    number | null = null

// Tracks which IDs we've called recordPlay for this session
const _playedThisSession = new Set<string>()

// ── Timer helpers ─────────────────────────────────────────────

function _stopTimer() {
  if (_timer !== null) { clearInterval(_timer); _timer = null }
}

function _startTimer(cb: (s: number) => void) {
  _stopTimer()
  _timer = window.setInterval(() => {
    if (_howl?.playing()) cb(_howl.seek() as number)
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

  const tickRef  = useRef((s: number) => setProgress(s))
  const volRef   = useRef(isMuted ? 0 : volume)
  const onEndRef = useRef<() => void>(() => {})

  useEffect(() => { tickRef.current = (s) => setProgress(s) }, [setProgress])
  useEffect(() => { volRef.current  = isMuted ? 0 : volume  }, [volume, isMuted])

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
    // Same track already loaded — just seek/play
    if (_loadedId === trackId && _howl && !forceRestart) {
      if (seekTo > 0) { _howl.seek(seekTo); setProgress(seekTo) }
      else            { _howl.seek(0);      setProgress(0) }
      if (autoplay && !_howl.playing()) _howl.play()
      return
    }

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

        // Seek to saved position before playing
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
        _startTimer((s) => tickRef.current(s))
      },

      onpause() {
        setPlaying(false)
        _stopTimer()
        // Save position so resume after reload works
        const pos = _howl?.seek() as number | undefined
        if (pos != null && pos > 0) saveProgress(pos)
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
  // On first mount: if currentTrack is rehydrated from localStorage but
  // _howl is null, reconstruct the Howl without autoplaying.
  // The user sees the PlayerBar with the last track; pressing play resumes.

  useEffect(() => {
    if (!currentTrack?.id) return

    if (_loadedId === currentTrack.id) return // already loaded this session

    const { savedProgress } = usePlayerStore.getState()

    // Reload scenario — reconstruct without autoplay, seek to saved position
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
    if (_howl) _howl.play()
    else if (currentTrack) {
      const { savedProgress } = usePlayerStore.getState()
      loadAndPlay(currentTrack.id, false, true, savedProgress)
    }
  }, [currentTrack, loadAndPlay])

  const pause = useCallback(() => { _howl?.pause() }, [])

  const togglePlay = useCallback(() => {
    if (_howl?.playing()) {
      _howl.pause()
    } else if (_howl) {
      _howl.play()
    } else if (currentTrack) {
      const { savedProgress } = usePlayerStore.getState()
      loadAndPlay(currentTrack.id, false, true, savedProgress)
    }
  }, [currentTrack, loadAndPlay])

  const seek = useCallback((s: number) => {
    _howl?.seek(s)
    setProgress(s)
    saveProgress(s)
  }, [setProgress, saveProgress])

  /**
   * resume — explicitly reconstructs the Howl at the saved position
   * and starts playing. Call this from a "Resume" button or on app focus.
   */
  const resume = useCallback(() => {
    if (!currentTrack) return
    const { savedProgress } = usePlayerStore.getState()

    if (_howl && _loadedId === currentTrack.id) {
      // Howl already loaded — just seek and play
      if (savedProgress > 0) { _howl.seek(savedProgress); setProgress(savedProgress) }
      _howl.play()
    } else {
      // Need to reconstruct
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