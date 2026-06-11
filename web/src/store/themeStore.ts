import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme, ThemeAccent, ThemeSurface } from '@/themes'
import { applyTheme, DEFAULT_THEME } from '@/themes'

interface ThemeStore {
  theme:      Theme
  setAccent:  (accent: ThemeAccent) => void
  setSurface: (surface: ThemeSurface) => void
  initTheme:  () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,

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

      // Call once in App.tsx after mount to apply the persisted theme
      // before first paint (avoids flash of wrong colours).
      initTheme: () => applyTheme(get().theme),
    }),
    { name: 'shulker-theme' },
  ),
)
