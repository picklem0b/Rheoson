import { create } from 'zustand'

interface UIStore {
  // Panels
  showQueue:      boolean
  showLyrics:     boolean
  showFullscreen: boolean
  showDownloads:  boolean

  // Sidebar (desktop)
  sidebarCollapsed: boolean

  // Modals
  downloadModalTrackId: string | null

  // Actions
  toggleQueue:      () => void
  toggleLyrics:     () => void
  toggleFullscreen: () => void
  toggleDownloads:  () => void
  toggleSidebar:    () => void
  openDownloadModal:  (trackId: string) => void
  closeDownloadModal: () => void
  closeAll:           () => void
}

export const useUIStore = create<UIStore>((set) => ({
  showQueue:            false,
  showLyrics:           false,
  showFullscreen:       false,
  showDownloads:        false,
  sidebarCollapsed:     false,
  downloadModalTrackId: null,

  toggleQueue:      () => set((s) => ({ showQueue: !s.showQueue, showLyrics: false })),
  toggleLyrics:     () => set((s) => ({ showLyrics: !s.showLyrics, showQueue: false })),
  toggleFullscreen: () => set((s) => ({ showFullscreen: !s.showFullscreen })),
  toggleDownloads:  () => set((s) => ({ showDownloads: !s.showDownloads })),
  toggleSidebar:    () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  openDownloadModal:  (trackId) => set({ downloadModalTrackId: trackId }),
  closeDownloadModal: () => set({ downloadModalTrackId: null }),

  closeAll: () => set({
    showQueue: false,
    showLyrics: false,
    showFullscreen: false,
    showDownloads: false,
    downloadModalTrackId: null,
  }),
}))