import { useEffect, useRef, useCallback } from 'react'
import { Howl, Howler } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'

// ── Module-level singleton ────────────────────────────────────
let _howl:     Howl   | null = null
let _loadedId: string | null = null
let _timer:    number | null = null

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

export function usePlayer() {
  const {
    currentTrack, volume, isMuted,
    setPlaying, setLoading, setProgress, setDuration, setTrack,
  } = usePlayerStore()
  const { next, prev } = useQueueStore()

  const tickRef  = useRef((s: number) => setProgress(s))
  const volRef   = useRef(isMuted ? 0 : volume)
  const onEndRef = useRef(() => {})

  useEffect(() => { tickRef.current = (s) => setProgress(s) }, [setProgress])
  useEffect(() => { volRef.current  = isMuted ? 0 : volume  }, [volume, isMuted])

  useEffect(() => {
    onEndRef.current = () => {
      _stopTimer()
      setPlaying(false)
      const { repeatMode, isShuffled } = usePlayerStore.getState()
      if (repeatMode === 'one') { _howl?.seek(0); _howl?.play(); return }
      const nt = next(isShuffled)
      if (nt) { setTrack(nt); return }
      if (repeatMode === 'all') { const f = next(false); if (f) setTrack(f) }
    }
  }, [next, setTrack, setPlaying])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadAndPlay = useCallback((trackId: string, forceRestart = false) => {
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
      html5:    true,      // REQUIRED for streaming
      format:   ['mp3'],   // we always serve mp3 from stream.py
      volume:   volRef.current,
      preload:  true,
      autoplay: true,      // start as soon as enough data is buffered

      onload() {
        // html5 streams may not fire onload until fully buffered
        // duration may be 0 for live streams — that's ok
        const dur = _howl?.duration() ?? 0
        if (dur > 0) setDuration(dur)
        setLoading(false)
      },

      onplay() {
        // Fires as soon as audio actually starts playing
        setPlaying(true)
        setLoading(false)
        const dur = _howl?.duration() ?? 0
        if (dur > 0) setDuration(dur)
        _startTimer((s) => tickRef.current(s))
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
        console.error('[Shulker] load error:', err, url)
        setLoading(false)
        setPlaying(false)
        _loadedId = null
      },

      onplayerror(_id, err) {
        console.error('[Shulker] play error:', err)
        if (Howler.ctx?.state === 'suspended') {
          Howler.ctx.resume()
            .then(() => _howl?.play())
            .catch(() => {})
        }
      },
    })
  }, []) // stable — uses refs only

  // React to track changes
  useEffect(() => {
    if (!currentTrack?.id) return
    loadAndPlay(currentTrack.id)
    tracksApi.recordPlay(currentTrack.id).catch(() => {})
    return () => _stopTimer()
  }, [currentTrack?.id])

  // Same-track restart
  useEffect(() => {
    const h = () => { if (currentTrack) loadAndPlay(currentTrack.id, true) }
    window.addEventListener('shulker:restart-track', h)
    return () => window.removeEventListener('shulker:restart-track', h)
  }, [currentTrack, loadAndPlay])

  // Volume sync
  useEffect(() => { _howl?.volume(isMuted ? 0 : volume) }, [volume, isMuted])

  // Cleanup
  useEffect(() => () => _stopTimer(), [])

  const play = useCallback(() => {
    if (_howl) _howl.play()
    else if (currentTrack) loadAndPlay(currentTrack.id)
  }, [currentTrack, loadAndPlay])

  const pause = useCallback(() => { _howl?.pause() }, [])

  const togglePlay = useCallback(() => {
    if (_howl?.playing()) _howl.pause()
    else if (_howl) _howl.play()
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
    if (progress > 3) { seek(0); return }
    const t = prev()
    if (t) setTrack(t)
  }, [prev, seek])

  return { play, pause, togglePlay, seek, skipNext, skipPrev, restartCurrent }
}