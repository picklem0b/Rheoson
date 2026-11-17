import type { TrackSummary } from '@rheoson/shared'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiFailure } from '@/lib/api/apiError'
import { resolveStream } from '@/lib/api/catalogue'

export interface Playback {
  tracks: TrackSummary[]
  index: number
}

/**
 * One audio element, owned by one component.
 *
 * Playback is a ticket per track: ask the API where the audio is, hand the URL to
 * the element, drop the URL. A failure is said out loud and the queue is kept, so
 * one dead track costs one track rather than the session.
 */
export function AudioPlayer({ playback }: { playback: Playback | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (playback) setIndex(playback.index)
  }, [playback])

  const track = playback?.tracks[index] ?? null
  const providerTrackId = track?.providerTrackId ?? null
  const provider = track?.provider ?? null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !provider || !providerTrackId) return

    const controller = new AbortController()
    setFailure(null)
    setLoading(true)
    setPosition(0)
    setDuration(0)

    void resolveStream(provider, providerTrackId, controller.signal)
      .then((ticket) => {
        if (controller.signal.aborted) return
        audio.src = ticket.url
        return audio.play()
      })
      .then(() => setPlaying(true))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPlaying(false)
        setFailure(error instanceof ApiFailure ? error.message : 'This track would not play')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [provider, providerTrackId])

  if (!playback || !track) return null

  const audio = audioRef.current

  const toggle = () => {
    if (!audio || !audio.currentSrc) return
    if (audio.paused) {
      void audio.play().catch(() => setFailure('This track would not play'))
    } else {
      audio.pause()
    }
  }

  const step = (delta: number) => {
    const next = index + delta
    if (next < 0 || next >= playback.tracks.length) {
      if (audio) audio.pause()
      return
    }
    setIndex(next)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-6 py-3">
        {track.artworkUrl ? (
          <img src={track.artworkUrl} alt="" className="size-12 shrink-0 rounded-sm object-cover" />
        ) : (
          <span aria-hidden className="size-12 shrink-0 rounded-sm bg-muted" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="truncate text-2xs text-muted-foreground">{track.artistName}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-right font-mono text-2xs text-muted-foreground">
              {formatTime(position)}
            </span>
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={duration || track.durationMs / 1000}
              step={1}
              value={Math.min(position, duration || track.durationMs / 1000)}
              onChange={(event) => {
                const seconds = Number(event.target.value)
                setPosition(seconds)
                if (audio) audio.currentTime = seconds
              }}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <span className="w-9 shrink-0 font-mono text-2xs text-muted-foreground">
              {formatTime(duration || track.durationMs / 1000)}
            </span>
          </div>

          {failure ? <p className="text-2xs text-danger">{failure}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" aria-label="Previous track" onClick={() => step(-1)}>
            ‹
          </Button>
          <Button
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={toggle}
            disabled={loading}
            className="size-11 rounded-full px-0"
          >
            {loading ? '…' : playing ? '❙❙' : '▶'}
          </Button>
          <Button variant="ghost" aria-label="Next track" onClick={() => step(1)}>
            ›
          </Button>
        </div>

        <audio
          ref={audioRef}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
          onEnded={() => step(1)}
          onError={() => {
            setPlaying(false)
            setFailure('This track would not play')
          }}
        />
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
