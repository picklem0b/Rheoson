import { create } from 'zustand'
import type { Track } from '@/types/track.types'

/**
 * Universal track context menu.
 *
 *  - 'pointer' mode: a popover at the cursor (right-click / long-press on
 *    devices with a mouse)
 *  - 'sheet' mode:  a bottom-sheet modal (long-press on touch screens)
 *
 * Opened from any track row via the useTrackContextMenu hook.
 */
interface ContextMenuState {
  track: Track | null
  mode: 'pointer' | 'sheet'
  x: number
  y: number
  openPointer: (track: Track, x: number, y: number) => void
  openSheet: (track: Track) => void
  close: () => void
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  track: null,
  mode: 'sheet',
  x: 0,
  y: 0,

  openPointer: (track, x, y) => set({ track, mode: 'pointer', x, y }),
  openSheet: (track) => set({ track, mode: 'sheet', x: 0, y: 0 }),
  close: () => set({ track: null }),
}))