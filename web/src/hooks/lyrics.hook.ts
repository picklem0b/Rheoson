import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { lyricsApi } from '@/api/lyrics.api'
import { usePlayerStore } from '@/store/player.store'

interface LyricsLine {
  text:       string
  startTime?: number   // milliseconds from track start (only set for synced lyrics)
}

/**
 * useLyrics
 * =========
 * Fetches lyrics for the given track and tracks which line is "active"
 * (i.e. currently being sung) as playback progresses.
 *
 * Live sync explained:
 *  - `progress` comes from the player store and updates every ~250ms
 *    while a track plays (see usePlayer's _startTimer).
 *  - Every time `progress` changes, we recalculate which lyric line's
 *    startTime is the most recent one at or before the current position.
 *  - That recalculation is what makes the highlighted line "follow" the
 *    song in real time, the same way Spotify/Apple Music does it.
 *
 * Why selectors instead of destructuring the whole store:
 *  `usePlayerStore((s) => s.progress)` only re-renders this hook when
 *  `progress` itself changes. Destructuring the whole store (the old way)
 *  re-renders on EVERY store change — volume, isLoading, isMuted, etc. —
 *  which adds unnecessary work on every single tick and can make the
 *  lyric highlight feel slightly less smooth under load.
 */
export function useLyrics(trackId: string | undefined) {
  const progress     = usePlayerStore((s) => s.progress)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  const [activeLine, setActiveLine] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey:  ['lyrics', trackId],
    queryFn:   () => lyricsApi.getLyrics(
      trackId!,
      currentTrack?.title,
      currentTrack?.artist?.name,
    ),
    enabled:   !!trackId,
    staleTime: 30 * 60 * 1000, // lyrics never change for a given track — cache for 30 min
    gcTime:    60 * 60 * 1000,
    retry:     false,
  })

  const lines  = data?.lines  ?? []
  const synced = data?.synced ?? false

  // Recompute the active line every time playback progress updates.
  useEffect(() => {
    if (!synced || lines.length === 0) return

    const progressMs = progress * 1000
    let idx = 0

    // Find the last line whose timestamp is at or before the current
    // playback position — that's the line currently being sung.
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].startTime
      if (t !== undefined && t <= progressMs) idx = i
    }

    setActiveLine(idx)
  }, [progress, lines, synced])

  return { lines, activeLine, synced, isLoading }
}