import { useEffect, useRef, useCallback } from 'react'
import { Howl } from 'howler'
import { usePlayerStore } from '@/store/playerStore'
import { useQueueStore } from '@/store/queueStore'
import { tracksApi } from '@/api/tracks'
import { PLAYER_DEFAULTS } from '@/lib/constants'

export function usePlayer() {
  const howl = useRef<Howl | null>(null)
  const progressTimer = useRef<number | null>(null)

  const {
    currentTrack, isPlaying, volume, isMuted, repeatMode, isShuffled,
    setPlaying, setLoading, setProgress, setDuration, setTrack,
  } = usePlayerStore()

  const { next, prev } = useQueueStore()

  const clearTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
  }

  const startTimer = useCallback(() => {
    clearTimer()
    progressTimer.current = window.setInterval(() => {
      if (howl.current?.playing()) {
        setProgress(howl.current.seek() as number)
      }
    }, 500)
  }, [setProgress])

  const loadTrack = useCallback((streamUrl: string) => {
    howl.current?.unload()
    clearTimer()

    howl.current = new Howl({
      src: [streamUrl],
      html5: true,
      volume: isMuted ? 0 : volume,
      onload: () => {
        setDuration(howl.current?.duration() ?? 0)
        setLoading(false)
        howl.current?.play()
        setPlaying(true)
        startTimer()
      },
      onend: () => {
        clearTimer()
        setPlaying(false)
        if (repeatMode === 'one') {
          howl.current?.seek(0)
          howl.current?.play()
          setPlaying(true)
          startTimer()
        } else {
          const nextTrack = next(isShuffled)
          if (nextTrack) setTrack(nextTrack)
        }
      },
      onloaderror: () => setLoading(false),
    })
  }, [volume, isMuted, repeatMode, isShuffled, setDuration, setLoading, setPlaying, startTimer, next, setTrack])

  // Load when track changes
  useEffect(() => {
    if (!currentTrack) return
    const url = tracksApi.getStreamUrl(currentTrack.id)
    loadTrack(url)
    tracksApi.recordPlay(currentTrack.id).catch(() => {})
    return () => { howl.current?.unload(); clearTimer() }
  }, [currentTrack?.id])

  // Sync volume
  useEffect(() => {
    howl.current?.volume(isMuted ? 0 : volume)
  }, [volume, isMuted])

  const play = useCallback(() => {
    howl.current?.play()
    setPlaying(true)
    startTimer()
  }, [setPlaying, startTimer])

  const pause = useCallback(() => {
    howl.current?.pause()
    setPlaying(false)
    clearTimer()
  }, [setPlaying])

  const togglePlay = useCallback(() => {
    isPlaying ? pause() : play()
  }, [isPlaying, play, pause])

  const seek = useCallback((seconds: number) => {
    howl.current?.seek(seconds)
    setProgress(seconds)
  }, [setProgress])

  const skipNext = useCallback(() => {
    const nextTrack = next(isShuffled)
    if (nextTrack) setTrack(nextTrack)
  }, [next, isShuffled, setTrack])

  const skipPrev = useCallback(() => {
    const progress = usePlayerStore.getState().progress
    if (progress > 3) {
      seek(0)
      return
    }
    const prevTrack = prev()
    if (prevTrack) setTrack(prevTrack)
  }, [prev, setTrack, seek])

  return { play, pause, togglePlay, seek, skipNext, skipPrev }
}