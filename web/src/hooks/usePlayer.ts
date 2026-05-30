import { useEffect, useRef, useCallback } from 'react'
import { Howl, Howler } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'

// ── Module-level singleton ────────────────────────────────────
let _howl:      Howl   | null = null
let _loadedId:  string | null = null
let _timer:     number | null = null
let _playedIds: Set<string>   = new Set()  // dedupe recordPlay calls

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

  // ── loadAndPlay — STABLE, empty deps ──────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadAndPlay = useCallback((trackId: string, forceRestart = false) => {
    // Same track + no force → restart from beginning
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
      html5:    true,    // REQUIRED — streaming mode
      format:   ['mp3'], // we always serve mp3
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
          Howler.ctx.resume().then(() => _howl?.play()).catch(() => {})
        }
      },
    })
  }, []) // empty deps — all state via refs

  // ── Track change — fires ONCE per track ID ─────────────────
  useEffect(() => {
    if (!currentTrack?.id) return

    loadAndPlay(currentTrack.id)

    // Deduplicated recordPlay — fires at most once per track per session
    if (!_playedIds.has(currentTrack.id)) {
      _playedIds.add(currentTrack.id)
      tracksApi.recordPlay(currentTrack.id, {
        title:      currentTrack.title,
        artist:     currentTrack.artist?.name ?? '',
        artworkUrl: currentTrack.artworkUrl ?? '',
        youtubeId:  currentTrack.youtubeId ?? currentTrack.id,
      }).catch(() => {})
    }

    return () => _stopTimer()
  }, [currentTrack?.id]) // ONLY re-run when track ID changes

  // ── Same-track restart ─────────────────────────────────────
  useEffect(() => {
    const h = () => { if (currentTrack) loadAndPlay(currentTrack.id, true) }
    window.addEventListener('shulker:restart-track', h)
    return () => window.removeEventListener('shulker:restart-track', h)
  }, [currentTrack, loadAndPlay])

  // ── Volume sync ────────────────────────────────────────────
  useEffect(() => { _howl?.volume(isMuted ? 0 : volume) }, [volume, isMuted])

  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => () => _stopTimer(), [])

  // ── Controls ───────────────────────────────────────────────
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
    _howl?.seek(s); setProgress(s)
  }, [setProgress])

  const restartCurrent = useCallback(() => {
    if (currentTrack) loadAndPlay(currentTrack.id, true)
  }, [currentTrack, loadAndPlay])

  const skipNext = useCallback(() => {
    const { isShuffled } = usePlayerStore.getState()
    const t = next(isShuffled); if (t) setTrack(t)
  }, [next, setTrack])

  const skipPrev = useCallback(() => {
    const { progress } = usePlayerStore.getState()
    if (progress > 3) { seek(0); return }
    const t = prev(); if (t) setTrack(t)
  }, [prev, seek])

  return { play, pause, togglePlay, seek, skipNext, skipPrev, restartCurrent }
}