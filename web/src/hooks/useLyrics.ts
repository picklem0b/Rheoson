import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { lyricsApi } from '@/api/lyrics'
import { usePlayerStore } from '@/store/playerStore'

interface LyricsLine {
  text:       string
  startTime?: number
}

export function useLyrics(trackId: string | undefined) {
  const { progress, currentTrack } = usePlayerStore()
  const [activeLine, setActiveLine] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey:  ['lyrics', trackId],
    queryFn:   () => lyricsApi.getLyrics(
      trackId!,
      currentTrack?.title,
      currentTrack?.artist?.name,
    ),
    enabled:   !!trackId,
    staleTime: 30 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
    retry:     false,
  })

  const lines  = data?.lines  ?? []
  const synced = data?.synced ?? false

  useEffect(() => {
    if (!synced || lines.length === 0) return
    const progressMs = progress * 1000
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].startTime
      if (t !== undefined && t <= progressMs) idx = i
    }
    setActiveLine(idx)
  }, [progress, lines, synced])

  return { lines, activeLine, synced, isLoading }
}