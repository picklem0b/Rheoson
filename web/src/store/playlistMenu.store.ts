import { create } from 'zustand'
import type { Track } from '@/types/track.types'

/**
 * Global "Add to playlist" sheet state.
 *
 * Any track row can open the sheet for its track via
 * `usePlaylistMenuStore().openForTrack(track)` — the sheet itself is
 * mounted once in RootLayout, mirroring the DownloadModal pattern.
 */
interface PlaylistMenuStore {
  track: Track | null
  openForTrack: (track: Track) => void
  close: () => void
}

export const usePlaylistMenuStore = create<PlaylistMenuStore>((set) => ({
  track: null,

  openForTrack: (track) => set({ track }),
  close: () => set({ track: null }),
}))