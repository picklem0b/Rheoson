import { useCallback } from 'react'
import { useQueueStore } from '@/store/queueStore'
import { usePlayerStore } from '@/store/playerStore'
import type { Track } from '@/types/track'

export function useQueue() {
  const store = useQueueStore()
  const { setTrack } = usePlayerStore()

  const playTrack = useCallback((track: Track, context: Track[] = []) => {
    const idx = context.findIndex((t) => t.id === track.id)
    if (context.length > 0) {
      store.setQueue(context, idx >= 0 ? idx : 0)
    }
    setTrack(track)
  }, [store, setTrack])

  const playAll = useCallback((tracks: Track[], startIndex = 0) => {
    store.setQueue(tracks, startIndex)
    setTrack(tracks[startIndex])
  }, [store, setTrack])

  return {
    queue:           store.queue,
    history:         store.history,
    addToQueue:      store.addToQueue,
    removeFromQueue: store.removeFromQueue,
    clearQueue:      store.clearQueue,
    moveItem:        store.moveItem,
    playTrack,
    playAll,
  }
}