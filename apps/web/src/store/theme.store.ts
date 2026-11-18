import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme, ThemeAccent, ThemeSurface } from '@/themes'
import { applyTheme, DEFAULT_THEME } from '@/themes'

interface ThemeStore {
  theme:          Theme
  glassOpacity:   number   // 0.0 – 1.0, controls glass/sidebar transparency
  setAccent:      (accent: ThemeAccent) => void
  setSurface:     (surface: ThemeSurface) => void
  setGlassOpacity:(v: number) => void
  initTheme:      () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme:        DEFAULT_THEME,
      glassOpacity: 0.7,

      setAccent: (accent) => {
        const theme = { ...get().theme, accent }
        set({ theme })
        applyTheme(theme)
      },

      setSurface: (surface) => {
        const theme = { ...get().theme, surface }
        set({ theme })
        applyTheme(theme)
      },

      setGlassOpacity: (v) => {
        const clamped = Math.max(0.1, Math.min(1.0, v))
        set({ glassOpacity: clamped })
        // Apply as a CSS custom property so glass-* classes pick it up instantly
        document.documentElement.style.setProperty(
          '--glass-opacity', String(clamped),
        )
      },

      initTheme: () => {
        const { theme, glassOpacity } = get()
        applyTheme(theme)
        document.documentElement.style.setProperty(
          '--glass-opacity', String(glassOpacity),
        )
      },
    }),
    { name: 'rheoson-theme' },
  ),
)