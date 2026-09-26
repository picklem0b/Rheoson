import { useCallback } from 'react'
import { useQueueStore } from '@/store/queue.store'
import { usePlayerStore } from '@/store/player.store'
import { signalQueueAdd } from '@/lib/signals'
import type { Track } from '@/types/track.types'

// Maps the current route to the "Playing from …" label the full-player
// header shows. One place, because every play action funnels through
// playTrack/playAll below. Falls back to the segment in a readable form.
function sourceFromRoute(): string {
  const path = window.location.pathname
  if (path.startsWith('/search')) return 'Search'
  if (path.startsWith('/trending')) return 'Trending this week'
  if (path.startsWith('/recently-played')) return 'Last played'
  if (path.startsWith('/featured')) return 'Featured'
  if (path.startsWith('/playlist')) return 'this playlist'
  if (path.startsWith('/album')) return 'this album'
  if (path.startsWith('/artist')) return 'this artist'
  return 'Your library'
}

interface PlayAllOptions {
  /** Start from a specific index in the tracks array. Default 0. */
  startIndex?: number
  /** Shuffle the queue before starting. Default false. */
  shuffle?: boolean
}

export function useQueue() {
  const store = useQueueStore()
  const { setTrack, currentTrack } = usePlayerStore()

  const playTrack = useCallback((track: Track, context: Track[] = []) => {
    usePlayerStore.getState().setPlaySource(sourceFromRoute())

    if (context.length > 0) {
      const idx = context.findIndex((t) => t.id === track.id)
      store.setQueue(context, idx >= 0 ? idx : 0)
    }

    // Same track → restart without rebuilding the Howl
    if (currentTrack?.id === track.id) {
      window.dispatchEvent(new CustomEvent('rheoson:restart-track'))
      return
    }

    setTrack(track)
  }, [store, setTrack, currentTrack])

  const playAll = useCallback((tracks: Track[], options: PlayAllOptions = {}) => {
    if (!tracks.length) return
    usePlayerStore.getState().setPlaySource(sourceFromRoute())

    const { startIndex = 0, shuffle = false } = options

    if (shuffle) {
      // Randomise order then start from index 0
      const shuffled = [...tracks].sort(() => Math.random() - 0.5)
      store.setQueue(shuffled, 0)
      setTrack(shuffled[0])
    } else {
      store.setQueue(tracks, startIndex)
      setTrack(tracks[startIndex])
    }
  }, [store, setTrack])

  // Wrapper so queueing also reports a signal to the rec engine
  const addToQueue = useCallback(
    (track: Track) => {
      const added = store.addToQueue(track)
      if (added) signalQueueAdd(track.id, track.artist?.name)
      return added
    },
    [store]
  )

  return {
    queue:           store.queue,
    history:         store.history,
    addToQueue,
    removeFromQueue: store.removeFromQueue,
    clearQueue:      store.clearQueue,
    moveItem:        store.moveItem,
    playTrack,
    playAll,
  }
}
