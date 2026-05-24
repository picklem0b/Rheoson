import { useEffect, useRef, useCallback } from 'react'
import { Howl, Howler } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'

// ── Single global Howl — module level, never recreated on render ──
let _howl: Howl | null = null
let _loadedId: string | null = null
let _timer: number | null = null

function _stopTimer() {
  if (_timer !== null) {
    clearInterval(_timer)
    _timer = null
  }
}

function _startTimer(onTick: (s: number) => void) {
  _stopTimer()
  _timer = window.setInterval(() => {
    if (_howl?.playing()) {
      onTick(_howl.seek() as number)
    }
  }, 250)
}

function _destroy() {
  _stopTimer()
  if (_howl) {
    _howl.off()
    _howl.stop()
    _howl.unload()
    _howl = null
  }
  _loadedId = null
}

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
  } = usePlayerStore()

  const { next, prev } = useQueueStore()

  // Keep stable refs to callbacks so Howl closures stay fresh
  const onTickRef     = useRef((s: number) => setProgress(s))
  const onEndRef      = useRef(() => {})
  const volumeRef     = useRef(isMuted ? 0 : volume)

  useEffect(() => { onTickRef.current = (s) => setProgress(s) }, [setProgress])
  useEffect(() => { volumeRef.current = isMuted ? 0 : volume }, [volume, isMuted])

  // ── onEnd logic lives in a ref so Howl closure always gets latest ──
  useEffect(() => {
    onEndRef.current = () => {
      _stopTimer()
      setPlaying(false)

      const { repeatMode, isShuffled } = usePlayerStore.getState()

      if (repeatMode === 'one') {
        _howl?.seek(0)
        _howl?.play()
        return
      }

      const nextTrack = next(isShuffled)
      if (nextTrack) {
        setTrack(nextTrack)
      } else if (repeatMode === 'all') {
        const first = next(false)
        if (first) setTrack(first)
      }
    }
  }, [next, setTrack, setPlaying])

  // ── Core: load and play a track ────────────────────────────
  const loadAndPlay = useCallback((trackId: string, forceRestart = false) => {
    // Same track, no force → seek to 0 and play if paused
    if (_loadedId === trackId && _howl && !forceRestart) {
      _howl.seek(0)
      setProgress(0)
      if (!_howl.playing()) {
        _howl.play()
      }
      return
    }

    // New track or force restart
    _destroy()
    setLoading(true)
    setProgress(0)
    setPlaying(false)
    setDuration(0)
    _loadedId = trackId

    const streamUrl = tracksApi.getStreamUrl(trackId)

    _howl = new Howl({
      src:      [streamUrl],
      html5:    true,          // MUST be true for HTTP streaming — false = full download before play
      format:   ['mp3', 'm4a', 'flac', 'ogg', 'opus', 'wav'],
      volume:   volumeRef.current,
      preload:  true,
      autoplay: false,         // we call play() manually in onload

      onload() {
        const dur = _howl?.duration() ?? 0
        setDuration(dur)
        setLoading(false)
        _howl?.play()
      },

      onplay() {
        setPlaying(true)
        _startTimer((s) => onTickRef.current(s))
      },

      onpause() {
        setPlaying(false)
        _stopTimer()
      },

      onstop() {
        setPlaying(false)
        _stopTimer()
        setProgress(0)
      },

      onend() {
        onEndRef.current()
      },

      onloaderror(_id, err) {
        console.error('[Shulker] Stream load error:', err, 'URL:', streamUrl)
        setLoading(false)
        setPlaying(false)
        _loadedId = null
      },

      onplayerror(_id, err) {
        console.error('[Shulker] Play error:', err)
        // Mobile browsers need audio context unlocked
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
          Howler.ctx.resume().then(() => {
            _howl?.play()
          })
        }
      },
    })
  }, [setLoading, setPlaying, setProgress, setDuration])

  // ── React when track changes ────────────────────────────────
  useEffect(() => {
  if (!currentTrack?.id) return
  loadAndPlay(currentTrack.id)
  tracksApi.recordPlay(currentTrack.id).catch(() => {})
  // Cleanup: stop timer when track changes (new Howl takes over)
  return () => _stopTimer()
}, [currentTrack?.id, loadAndPlay])

  // ── Same-track restart via custom event ────────────────────
  useEffect(() => {
    const handler = () => {
      if (currentTrack) loadAndPlay(currentTrack.id, true)
    }
    window.addEventListener('shulker:restart-track', handler)
    return () => window.removeEventListener('shulker:restart-track', handler)
  }, [currentTrack, loadAndPlay])

  // ── Volume/mute sync ───────────────────────────────────────
  useEffect(() => {
    _howl?.volume(isMuted ? 0 : volume)
  }, [volume, isMuted])

  // ── Stop timer on unmount ──────────────────────────────────
  useEffect(() => () => _stopTimer(), [])

  // ── Controls ───────────────────────────────────────────────
  const play = useCallback(() => {
    if (_howl) {
      _howl.play()
    } else if (currentTrack) {
      loadAndPlay(currentTrack.id)
    }
  }, [currentTrack, loadAndPlay])

  const pause = useCallback(() => {
    _howl?.pause()
  }, [])

  const togglePlay = useCallback(() => {
    if (_howl?.playing()) {
      _howl.pause()
    } else if (_howl) {
      _howl.play()
    } else if (currentTrack) {
      loadAndPlay(currentTrack.id)
    }
  }, [currentTrack, loadAndPlay])

  const seek = useCallback((seconds: number) => {
    if (_howl) {
      _howl.seek(seconds)
      setProgress(seconds)
    }
  }, [setProgress])

  const restartCurrent = useCallback(() => {
    if (currentTrack) loadAndPlay(currentTrack.id, true)
  }, [currentTrack, loadAndPlay])

  const skipNext = useCallback(() => {
    const { isShuffled } = usePlayerStore.getState()
    const nextTrack = next(isShuffled)
    if (nextTrack) setTrack(nextTrack)
  }, [next, setTrack])

  const skipPrev = useCallback(() => {
    const { progress } = usePlayerStore.getState()
    if (progress > 3) {
      seek(0)
      return
    }
    const prevTrack = prev()
    if (prevTrack) setTrack(prevTrack)
  }, [prev, seek])

  return { play, pause, togglePlay, seek, skipNext, skipPrev, restartCurrent }
}