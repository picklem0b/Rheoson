import { useCallback } from 'react'
import { useQueueStore } from '@/store/queueStore'
import { usePlayerStore } from '@/store/playerStore'
import type { Track } from '@/types/track'

export function useQueue() {
  const store = useQueueStore()
  const { setTrack, currentTrack } = usePlayerStore()

  const playTrack = useCallback((track: Track, context: Track[] = []) => {
    // Set queue context first
    if (context.length > 0) {
      const idx = context.findIndex((t) => t.id === track.id)
      store.setQueue(context, idx >= 0 ? idx : 0)
    }

    // Same track clicked → restart from beginning, don't create new Howl
    if (currentTrack?.id === track.id) {
      window.dispatchEvent(new CustomEvent('shulker:restart-track'))
      return
    }

    // Different track → load it
    setTrack(track)
  }, [store, setTrack, currentTrack])

  const playAll = useCallback((tracks: Track[], startIndex = 0) => {
    if (!tracks.length) return
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