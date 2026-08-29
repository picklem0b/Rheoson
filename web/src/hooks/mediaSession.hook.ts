import { useEffect } from 'react'
import { usePlayerStore } from '@/store/player.store'
import { usePlayer } from './player.hook'

export function useMediaSession() {
  const { currentTrack, isPlaying, progress, duration } = usePlayerStore()
  const { togglePlay, skipNext, skipPrev, seek } = usePlayer()

  // ── Metadata + action handlers ─────────────────────────────
  // Re-registers only when the track changes.

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title:   currentTrack.title,
      artist:  currentTrack.artist.name,
      album:   currentTrack.album?.title ?? '',
      artwork: currentTrack.artworkUrl
        ? [{ src: currentTrack.artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    })

    navigator.mediaSession.setActionHandler('play',          () => togglePlay())
    navigator.mediaSession.setActionHandler('pause',         () => togglePlay())
    navigator.mediaSession.setActionHandler('nexttrack',     () => skipNext())
    navigator.mediaSession.setActionHandler('previoustrack', () => skipPrev())

    // Seekto enables the lock-screen / notification scrubber on Android + desktop
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) seek(details.seekTime)
    })

    // Seekbackward / seekforward for headphone remote buttons
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const step = details.seekOffset ?? 10
      const { progress: p } = usePlayerStore.getState()
      seek(Math.max(0, p - step))
    })

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const step = details.seekOffset ?? 10
      const { progress: p, duration: d } = usePlayerStore.getState()
      seek(Math.min(d, p + step))
    })

    return () => {
      for (const action of [
        'play', 'pause', 'nexttrack', 'previoustrack',
        'seekto', 'seekbackward', 'seekforward',
      ] as MediaSessionAction[]) {
        try { navigator.mediaSession.setActionHandler(action, null) } catch { /* unsupported action */ }
      }
    }
  }, [currentTrack, togglePlay, skipNext, skipPrev, seek])

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
