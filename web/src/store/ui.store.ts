import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NavStyle    = 'pill' | 'flat' | 'minimal'
export type NavPosition = 'bottom' | 'top'
export type FontFamily  = 'plus-jakarta' | 'inter' | 'system'
export type FontSize    = 'small' | 'default' | 'large'

// Applied as CSS custom properties consumed by index.css (--font-body,
// --font-size-base). Kept here so they can be re-applied on app boot.
const FONT_STACKS: Record<FontFamily, string> = {
  'plus-jakarta': '"Plus Jakarta Sans", system-ui, sans-serif',
  'inter':        '"Inter", system-ui, sans-serif',
  'system':       '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const FONT_SIZES: Record<FontSize, string> = {
  small:   '14px',
  default: '16px',
  large:   '18px',
}

interface UIStore {
  // Panels
  showQueue:      boolean
  showLyrics:     boolean
  showFullscreen: boolean
  showDownloads:  boolean
  showEqualizer:  boolean

  // Sidebar (desktop)
  sidebarCollapsed: boolean

  // Modals
  downloadModalTrackId: string | null
  /** Track object when the caller already has one — lets the download modal skip a refetch that can 404 for non-library tracks. */
  downloadModalTrack: import('@/types/track.types').Track | null

  // Layout preferences (settings-driven)
  navStyle:    NavStyle
  navPosition: NavPosition
  fontFamily:  FontFamily
  fontSize:    FontSize

  /** Settings → Appearance → Reduce motion. When true, the shell renders
   *  inside <MotionConfig reducedMotion="always"> so every framer-motion
   *  animation jumps to its end state — one switch that calms the whole app. */
  reduceMotion: boolean

  // Actions — panels
  toggleQueue:        () => void
  toggleLyrics:       () => void
  toggleFullscreen:   () => void
  toggleDownloads:    () => void
  toggleEqualizer:    () => void
  toggleSidebar:      () => void
  openDownloadModal:  (trackId: string, track?: import('@/types/track.types').Track) => void
  closeDownloadModal: () => void
  closeAll:           () => void

  // Actions — layout
  setNavStyle:    (v: NavStyle)    => void
  setNavPosition: (v: NavPosition) => void
  setFontFamily:  (v: FontFamily)  => void
  setFontSize:    (v: FontSize)    => void
  setReduceMotion:(v: boolean)     => void
  initLayout:     () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => {
      const applyLayout = (fontFamily: FontFamily, fontSize: FontSize) => {
        document.documentElement.style.setProperty('--font-body', FONT_STACKS[fontFamily])
        document.documentElement.style.setProperty('--font-size-base', FONT_SIZES[fontSize])
      }

      return {
      showQueue:            false,
      showLyrics:           false,
      showFullscreen:       false,
      showDownloads:        false,
      showEqualizer:        false,
      sidebarCollapsed:     false,
      downloadModalTrackId: null,
      downloadModalTrack: null,

      navStyle:    'pill',
      navPosition: 'bottom',
      fontFamily:  'plus-jakarta',
      fontSize:    'default',
      reduceMotion: false,

      toggleQueue:      () => set((s) => ({ showQueue:   !s.showQueue,   showLyrics: false, showEqualizer: false })),
      toggleLyrics:     () => set((s) => ({ showLyrics:  !s.showLyrics,  showQueue:  false, showEqualizer: false })),
      toggleEqualizer:  () => set((s) => ({ showEqualizer: !s.showEqualizer, showQueue: false, showLyrics: false })),
      toggleFullscreen: () => set((s) => ({ showFullscreen: !s.showFullscreen })),
      toggleDownloads:  () => set((s) => ({ showDownloads:  !s.showDownloads  })),
      toggleSidebar:    () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      openDownloadModal:  (trackId, track?) =>
         set({ downloadModalTrackId: trackId, downloadModalTrack: track ?? null }),
      closeDownloadModal: () =>
         set({ downloadModalTrackId: null, downloadModalTrack: null }),

      closeAll: () => set({
        showQueue:            false,
        showLyrics:           false,
        showFullscreen:       false,
        showDownloads:        false,
        showEqualizer:        false,
        downloadModalTrackId: null,
        downloadModalTrack: null,
      }),

      setNavStyle:    (v) => set({ navStyle: v }),
      setNavPosition: (v) => set({ navPosition: v }),

      setFontFamily: (v) => {
        set({ fontFamily: v })
        applyLayout(v, get().fontSize)
      },

      setFontSize: (v) => {
        set({ fontSize: v })
        applyLayout(get().fontFamily, v)
      },

      setReduceMotion: (v) => set({ reduceMotion: v }),

      initLayout: () => {
        const { fontFamily, fontSize } = get()
        applyLayout(fontFamily, fontSize)
      },
      }
    },
    {
      name: 'rheoson-ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        navStyle:         s.navStyle,
        navPosition:      s.navPosition,
        fontFamily:       s.fontFamily,
        fontSize:         s.fontSize,
        reduceMotion:     s.reduceMotion,
      }),
    },
  ),
)
