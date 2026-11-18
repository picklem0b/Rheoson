import { create } from 'zustand'

/**
 * Share-to-chat modal state.
 *
 * Any surface with something shareable (track rows, NowPlaying, lyrics,
 * playlists) opens this store with a payload; the single modal instance
 * mounted in RootLayout renders it. The payload's `kind` maps 1:1 to the
 * backend's share kinds, so a new shareable type is one caller away —
 * no new modal, no new plumbing.
 */

export interface SharePayload {
   kind: 'track' | 'lyrics' | 'playlist' | 'album' | 'artist' | 'blend'
   /** Primary id — trackId, playlistId, etc. */
   id: string
   /** Human title shown in the modal ("Sharing: …"). */
   title: string
   subtitle?: string
   artworkUrl?: string
   /** Optional lyric snippet when kind === 'lyrics'. */
   snippet?: string
}

interface ShareState {
   open: boolean
   payload: SharePayload | null
   openShare: (payload: SharePayload) => void
   closeShare: () => void
}

export const useShareStore = create<ShareState>((set) => ({
   open: false,
   payload: null,
   openShare: (payload) => set({ open: true, payload }),
   closeShare: () => set({ open: false, payload: null }),
}))
