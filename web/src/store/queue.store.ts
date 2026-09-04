import { create } from 'zustand'
import type { Track } from '@/types/track.types'
import { shuffle as shuffleArray } from '@/lib/utils'

// ── Store ─────────────────────────────────────────────────────

interface QueueStore {
  queue:         Track[]
  history:       Track[]
  originalQueue: Track[]

  setQueue:        (tracks: Track[], startIndex?: number) => void
  addToQueue:      (track: Track) => void
  removeFromQueue: (index: number) => void
  clearQueue:      () => void
  next:            (isShuffled: boolean) => Track | null
  prev:            () => Track | null
  shuffleQueue:    () => void
  restoreQueue:    () => void
  moveItem:        (from: number, to: number) => void
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  queue:         [],
  history:       [],
  originalQueue: [],

  setQueue: (tracks, startIndex = 0) => {
    const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1))
    set({
      // Tracks after the start index are the upcoming queue
      queue:         tracks.slice(safeIndex + 1),
      // Tracks before (and including) start index go into history
      history:       tracks.slice(0, safeIndex + 1),
      originalQueue: tracks,
    })
  },

  addToQueue: (track) =>
    set((s) => {
      // Never queue a track that's already up next or currently playing
      const dup = s.queue.some((t) => t.id === track.id)
      const playing = s.history[s.history.length - 1]
      if (dup || playing?.id === track.id) return s
      return { queue: [...s.queue, track] }
    }),

  removeFromQueue: (index) =>
    set((s) => ({ queue: s.queue.filter((_, i) => i !== index) })),

  clearQueue: () => set({ queue: [], history: [], originalQueue: [] }),

  next: (isShuffled) => {
    const { queue, history } = get()
    if (queue.length === 0) return null

    // Pick index: random for shuffle, always 0 for sequential
    const idx = isShuffled ? Math.floor(Math.random() * queue.length) : 0

    const nextTrack = queue[idx]
    const remaining = queue.filter((_, i) => i !== idx)

    set({
      queue:   remaining,
      // Always push to history — the previous conditional was dropping history
      // when the last history entry was falsy (e.g. empty string id)
      history: [...history, nextTrack],
    })

    return nextTrack
  },

  prev: () => {
    const { history, queue } = get()
    if (history.length === 0) return null

    // The current track is the last item in history
    const current = history[history.length - 1]
    const target  = history[history.length - 2] ?? null

    if (!target) return null   // already at the very beginning

    set({
      // Remove both current and target from history;
      // target will become current, current goes back on the front of queue
      history: history.slice(0, -2),
      queue:   [current, ...queue],
    })

    return target
  },

  shuffleQueue: () =>
    set((s) => ({ queue: shuffleArray([...s.queue]) })),

  restoreQueue: () =>
    set((s) => {
      // Restore from the current position: everything after history stays
      const historyLen = s.history.length
      return {
        queue: s.originalQueue.slice(historyLen),
      }
    }),

  moveItem: (from, to) =>
    set((s) => {
      const q = [...s.queue]
      const [item] = q.splice(from, 1)
      q.splice(to, 0, item)
      return { queue: q }
    }),
}))
