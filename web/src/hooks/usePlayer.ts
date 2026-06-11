import { useEffect, useRef, useCallback } from 'react'
import { Howl, Howler } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'

// ── Module-level singleton ────────────────────────────────────
// One Howl at a time. Lives outside React so it survives re-renders.

let _howl:     Howl   | null = null
let _loadedId: string | null = null
let _timer:    number | null = null

// Guard: don't call recordPlay more than once per track per session
const _playedThisSession = new Set<string>()

// ── Timer helpers ─────────────────────────────────────────────

function _stopTimer() {
  if (_timer !== null) { clearInterval(_timer); _timer = null }
}

function _startTimer(cb: (s: number) => void) {
  _stopTimer()
  _timer = window.setInterval(() => {
    // Guard: only read seek if actually playing
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
  } = usePlayerStore()
  const { next, prev } = useQueueStore()

  // Refs so Howl callbacks always see the latest values without
  // needing to recreate the Howl instance.
  const tickRef  = useRef((s: number) => setProgress(s))
  const volRef   = useRef(isMuted ? 0 : volume)
  const onEndRef = useRef<() => void>(() => {})

  useEffect(() => { tickRef.current = (s) => setProgress(s) }, [setProgress])
  useEffect(() => { volRef.current  = isMuted ? 0 : volume  }, [volume, isMuted])

  // Keep onEnd up to date with latest queue/repeat state without
  // touching the Howl instance.
  useEffect(() => {
    onEndRef.current = () => {
      _stopTimer()
      setPlaying(false)
      setProgress(0)

      const { repeatMode, isShuffled } = usePlayerStore.getState()

      if (repeatMode === 'one') {
        // Repeat current: seek back and play same Howl
        _howl?.seek(0)
        _howl?.play()
        return
      }

      const nextTrack = next(isShuffled)

      if (nextTrack) {
        setTrack(nextTrack)
        return
      }

      if (repeatMode === 'all') {
        // Queue exhausted — restart from the full original queue
        const { originalQueue } = useQueueStore.getState()
        if (originalQueue.length > 0) {
          // Re-populate the queue and start from the top
          useQueueStore.getState().setQueue(originalQueue, 0)
          setTrack(originalQueue[0])
        }
      }
      // repeatMode === 'off' and no next → playback stops naturally
    }
  }, [next, setTrack, setPlaying, setProgress])

  // ── Load and play a track ──────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadAndPlay = useCallback((trackId: string, forceRestart = false) => {
    // Same track, already loaded — just seek to start and play
    if (_loadedId === trackId && _howl && !forceRestart) {
      _howl.seek(0)
      setProgress(0)
      if (!_howl.playing()) _howl.play()
      return
    }

    _destroy()
    setLoading(true)
    setProgress(0)
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
      autoplay: true,

      onload() {
        const dur = _howl?.duration() ?? 0
        if (dur > 0) setDuration(dur)
        setLoading(false)
      },
      onplay() {
        setPlaying(true)
        setLoading(false)
        const dur = _howl?.duration() ?? 0
        if (dur > 0) setDuration(dur)
        _startTimer((s) => tickRef.current(s))
      },
      onpause() { setPlaying(false); _stopTimer()              },
      onstop()  { setPlaying(false); _stopTimer(); setProgress(0) },
      onend()   { onEndRef.current()                           },

      onloaderror(_id, err) {
        console.error('[Shulker] stream load error', { trackId, url, err })
        setLoading(false)
        setPlaying(false)
        _loadedId = null
      },
      onplayerror(_id, err) {
        console.error('[Shulker] playback error', err)
        // iOS / Chrome may suspend AudioContext until user gesture
        if (Howler.ctx?.state === 'suspended') {
          Howler.ctx.resume().then(() => _howl?.play()).catch(() => {})
        }
      },
    })
  }, []) // intentionally empty — all values accessed via refs

  // ── Trigger load when currentTrack changes ─────────────────

  useEffect(() => {
    if (!currentTrack?.id) return

    loadAndPlay(currentTrack.id)

    // recordPlay: once per track per page session
    if (!_playedThisSession.has(currentTrack.id)) {
      _playedThisSession.add(currentTrack.id)
      tracksApi.recordPlay(currentTrack.id).catch(() => {})
    }

    return () => _stopTimer()
  // loadAndPlay is stable (empty deps), safe to omit per exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id])

  // ── Same-track restart via custom event ────────────────────
  // useQueue dispatches this when the user taps the already-playing track.

  useEffect(() => {
    const handler = () => {
      if (currentTrack?.id) loadAndPlay(currentTrack.id, true)
    }
    window.addEventListener('shulker:restart-track', handler)
    return () => window.removeEventListener('shulker:restart-track', handler)
  }, [currentTrack?.id, loadAndPlay])

  // ── Volume sync ────────────────────────────────────────────

  useEffect(() => {
    _howl?.volume(isMuted ? 0 : volume)
  }, [volume, isMuted])

  // ── Cleanup on unmount ─────────────────────────────────────

  useEffect(() => () => _stopTimer(), [])

  // ── Public API ─────────────────────────────────────────────

  const play = useCallback(() => {
    if (_howl) _howl.play()
    else if (currentTrack) loadAndPlay(currentTrack.id)
  }, [currentTrack, loadAndPlay])

  const pause = useCallback(() => { _howl?.pause() }, [])

  const togglePlay = useCallback(() => {
    if (_howl?.playing()) _howl.pause()
    else if (_howl)        _howl.play()
    else if (currentTrack) loadAndPlay(currentTrack.id)
  }, [currentTrack, loadAndPlay])

  const seek = useCallback((s: number) => {
    _howl?.seek(s)
    setProgress(s)
  }, [setProgress])

  const restartCurrent = useCallback(() => {
    if (currentTrack) loadAndPlay(currentTrack.id, true)
  }, [currentTrack, loadAndPlay])

  const skipNext = useCallback(() => {
    const { isShuffled } = usePlayerStore.getState()
    const t = next(isShuffled)
    if (t) setTrack(t)
  }, [next, setTrack])

  const skipPrev = useCallback(() => {
    const { progress } = usePlayerStore.getState()
    // Within first 3 seconds → restart; otherwise go to previous
    if (progress > 3) { seek(0); return }
    const t = prev()
    if (t) setTrack(t)
  }, [prev, seek, setTrack])

  return { play, pause, togglePlay, seek, skipNext, skipPrev, restartCurrent }
}
