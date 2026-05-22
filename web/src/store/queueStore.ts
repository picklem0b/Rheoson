import { create } from 'zustand'
import type { Track } from '@/types/track'
import { shuffle } from '@/lib/utils'

interface QueueStore {
  queue:          Track[]
  history:        Track[]
  originalQueue:  Track[]

  // Actions
  setQueue:       (tracks: Track[], startIndex?: number) => void
  addToQueue:     (track: Track) => void
  removeFromQueue:(index: number) => void
  clearQueue:     () => void
  next:           (isShuffled: boolean) => Track | null
  prev:           () => Track | null
  shuffleQueue:   () => void
  restoreQueue:   () => void
  moveItem:       (from: number, to: number) => void
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  queue:         [],
  history:       [],
  originalQueue: [],

  setQueue: (tracks, startIndex = 0) => {
    const queue = tracks.slice(startIndex)
    const history = tracks.slice(0, startIndex)
    set({ queue, history, originalQueue: tracks })
  },

  addToQueue: (track) =>
    set((s) => ({ queue: [...s.queue, track] })),

  removeFromQueue: (index) =>
    set((s) => ({ queue: s.queue.filter((_, i) => i !== index) })),

  clearQueue: () => set({ queue: [], history: [], originalQueue: [] }),

  next: (isShuffled) => {
    const { queue, history } = get()
    if (queue.length === 0) return null

    let nextIndex = 0
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * queue.length)
    }

    const [next, ...rest] = isShuffled
      ? [queue[nextIndex], ...queue.filter((_, i) => i !== nextIndex)]
      : queue

    const prev = history[history.length - 1]
    set({
      queue: rest,
      history: prev ? [...history, next] : [next],
    })
    return next
  },

  prev: () => {
    const { history, queue } = get()
    if (history.length === 0) return null
    const prev = history[history.length - 1]
    set({
      history: history.slice(0, -1),
      queue: [prev, ...queue],
    })
    return prev
  },

  shuffleQueue: () =>
    set((s) => ({ queue: shuffle(s.queue) })),

  restoreQueue: () =>
    set((s) => ({ queue: s.originalQueue })),

  moveItem: (from, to) =>
    set((s) => {
      const q = [...s.queue]
      const [item] = q.splice(from, 1)
      q.splice(to, 0, item)
      return { queue: q }
    }),
}))