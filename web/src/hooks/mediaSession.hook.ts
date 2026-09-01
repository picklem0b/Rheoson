import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/store/player.store'
import { usePlayer } from './player.hook'

export function useMediaSession() {
  const currentTrack = usePlayerStore(s => s.currentTrack)
  const isPlaying    = usePlayerStore(s => s.isPlaying)
  const progress     = usePlayerStore(s => s.progress)
  const duration     = usePlayerStore(s => s.duration)
  const { togglePlay, skipNext, skipPrev, seek } = usePlayer()

  // Store refs so action handlers always call the latest functions
  const togglePlayRef = useRef(togglePlay)
  const skipNextRef   = useRef(skipNext)
  const skipPrevRef   = useRef(skipPrev)
  const seekRef       = useRef(seek)

  useEffect(() => { togglePlayRef.current = togglePlay }, [togglePlay])
  useEffect(() => { skipNextRef.current   = skipNext },   [skipNext])
  useEffect(() => { skipPrevRef.current   = skipPrev },   [skipPrev])
  useEffect(() => { seekRef.current       = seek },       [seek])

  // ── Metadata + action handlers ─────────────────────────────
  // Re-registers only when the track changes.

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title:   currentTrack.title,
      artist:  currentTrack.artist?.name ?? 'Unknown Artist',
      album:   currentTrack.album?.title ?? '',
      artwork: currentTrack.artworkUrl
        ? [{ src: currentTrack.artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    })

    navigator.mediaSession.setActionHandler('play',          () => togglePlayRef.current())
    navigator.mediaSession.setActionHandler('pause',         () => togglePlayRef.current())
    navigator.mediaSession.setActionHandler('nexttrack',     () => skipNextRef.current())
    navigator.mediaSession.setActionHandler('previoustrack', () => skipPrevRef.current())

    // Seekto enables the lock-screen / notification scrubber on Android + desktop
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) seekRef.current(details.seekTime)
    })

    // Seekbackward / seekforward for headphone remote buttons
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const step = details.seekOffset ?? 10
      const { progress: p } = usePlayerStore.getState()
      seekRef.current(Math.max(0, p - step))
    })

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const step = details.seekOffset ?? 10
      const { progress: p, duration: d } = usePlayerStore.getState()
      seekRef.current(Math.min(d, p + step))
    })

    return () => {
      for (const action of [
        'play', 'pause', 'nexttrack', 'previoustrack',
        'seekto', 'seekbackward', 'seekforward',
      ] as MediaSessionAction[]) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* unsupported action */ }
      }
    }
  }, [currentTrack])

  // ── Playback state ─────────────────────────────────────────

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  // ── Position state (powers the lock-screen scrubber) ───────
  // Update every time progress ticks — cheap call, no DOM work.

  useEffect(() => {
    if (!('mediaSession' in navigator) || duration === 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position:     Math.min(progress, duration),
        playbackRate: 1,
      })
    } catch { /* setPositionState not supported everywhere */ }
  }, [progress, duration])
}
