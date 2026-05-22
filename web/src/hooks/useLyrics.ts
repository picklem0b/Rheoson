import { useState, useEffect, useRef } from 'react'
import { lyricsApi, type LyricsLine } from '@/api/lyrics'
import { usePlayerStore } from '@/store/playerStore'

export function useLyrics(trackId: string | undefined) {
  const [lines, setLines]           = useState<LyricsLine[]>([])
  const [activeLine, setActiveLine] = useState(0)
  const [isLoading, setLoading]     = useState(false)
  const [synced, setSynced]         = useState(false)
  const progress                    = usePlayerStore((s) => s.progress)

  useEffect(() => {
    if (!trackId) return
    setLoading(true)
    setLines([])
    setActiveLine(0)

    lyricsApi.getLyrics(trackId)
      .then((data) => {
        setLines(data.lines)
        setSynced(data.synced)
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false))
  }, [trackId])

  // Sync active line to playback progress
  useEffect(() => {
    if (!synced || lines.length === 0) return
    const ms = progress * 1000
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= ms) idx = i
      else break
    }
    setActiveLine(idx)
  }, [progress, lines, synced])

  return { lines, activeLine, isLoading, synced }
}