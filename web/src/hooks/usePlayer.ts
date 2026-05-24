import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'

export function usePlayer() {
  const howlRef         = useRef<Howl | null>(null)
  const progressTimer   = useRef<number | null>(null)
  const currentTrackId  = useRef<string | null>(null)

  const {
    currentTrack, isPlaying, volume, isMuted,
    repeatMode, isShuffled,
    setPlaying, setLoading, setProgress, setDuration, setTrack,
  } = usePlayerStore()

  const { next, prev } = useQueueStore()

  // ── Timer ────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    progressTimer.current = window.setInterval(() => {
      const h = howlRef.current
      if (h?.playing()) {
        setProgress(h.seek() as number)
      }
    }, 250)   // 250ms — smoother progress bar
  }, [clearTimer, setProgress])

  // ── Load track ────────────────────────────────────────────
  useEffect(() => {
    if (!currentTrack) return
    // Prevent double-load for same track
    if (currentTrackId.current === currentTrack.id) return
    currentTrackId.current = currentTrack.id

    const streamUrl = tracksApi.getStreamUrl(currentTrack.id)

    // Unload previous
    howlRef.current?.unload()
    clearTimer()
    setLoading(true)
    setProgress(0)

    const howl = new Howl({
      src:   [streamUrl],
      html5: true,           // required for streaming
      format: ['mp3', 'flac', 'm4a', 'ogg', 'opus'],
      volume: isMuted ? 0 : volume,

      onload: () => {
        setDuration(howl.duration())
        setLoading(false)
        howl.play()
        setPlaying(true)
        startTimer()
      },

      onplay: () => {
        setPlaying(true)
        startTimer()
      },

      onpause: () => {
        setPlaying(false)
        clearTimer()
      },

      onstop: () => {
        setPlaying(false)
        clearTimer()
        setProgress(0)
      },

      onend: () => {
        clearTimer()
        setPlaying(false)

        const { repeatMode, isShuffled } = usePlayerStore.getState()

        if (repeatMode === 'one') {
          howl.seek(0)
          howl.play()
          setPlaying(true)
          startTimer()
          return
        }

        const nextTrack = next(isShuffled)
        if (nextTrack) {
          currentTrackId.current = null   // allow reload
          setTrack(nextTrack)
        } else if (repeatMode === 'all') {
          // Restart queue — handled by queueStore
          const nextT = next(false)
          if (nextT) {
            currentTrackId.current = null
            setTrack(nextT)
          }
        }
      },

      onloaderror: (_id, err) => {
        console.error('[Howler] load error', err)
        setLoading(false)
        setPlaying(false)
      },

      onplayerror: (_id, err) => {
        console.error('[Howler] play error', err)
        // Howler quirk — unlock audio context then retry
        howl.once('unlock', () => howl.play())
      },
    })

    howlRef.current = howl

    // Record play
    tracksApi.recordPlay(currentTrack.id).catch(() => {})

    return () => {
      howl.unload()
      clearTimer()
    }
  }, [currentTrack?.id])   // ONLY re-run when track ID changes

  // ── Volume sync ───────────────────────────────────────────
  useEffect(() => {
    howlRef.current?.volume(isMuted ? 0 : volume)
  }, [volume, isMuted])

  // ── Controls ──────────────────────────────────────────────
  const play = useCallback(() => {
    howlRef.current?.play()
    setPlaying(true)
    startTimer()
  }, [setPlaying, startTimer])

  const pause = useCallback(() => {
    howlRef.current?.pause()
    setPlaying(false)
    clearTimer()
  }, [setPlaying, clearTimer])

  const togglePlay = useCallback(() => {
    const { isPlaying } = usePlayerStore.getState()
    isPlaying ? pause() : play()
  }, [play, pause])

  const seek = useCallback((seconds: number) => {
    howlRef.current?.seek(seconds)
    setProgress(seconds)
  }, [setProgress])

  const skipNext = useCallback(() => {
    const { isShuffled } = usePlayerStore.getState()
    currentTrackId.current = null
    const nextTrack = next(isShuffled)
    if (nextTrack) setTrack(nextTrack)
  }, [next, setTrack])

  const skipPrev = useCallback(() => {
    const { progress } = usePlayerStore.getState()
    if (progress > 3) { seek(0); return }
    currentTrackId.current = null
    const prevTrack = prev()
    if (prevTrack) setTrack(prevTrack)
  }, [prev, seek, setTrack])

  return { play, pause, togglePlay, seek, skipNext, skipPrev }
}