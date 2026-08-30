import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Howler } from 'howler'
import { router } from './router'
import { useThemeStore } from '@/store/theme.store'
import { useAuthStore } from '@/store/auth.store'
import { useKeyboardShortcuts } from '@/hooks/keyboardShortcuts.hook'
import { useMediaSession } from '@/hooks/mediaSession.hook'
import { useToast } from '@/components/ui/Toaster'
import SplashScreen, { useSplash } from '@/components/ui/SplashScreen'

// ── Player error toast ────────────────────────────────────────
function usePlayerErrorToast() {
  const { toast } = useToast()

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      toast(
        detail?.savedPos
          ? `Couldn't play this track — tap to retry`
          : `Couldn't load this track`,
        'error',
        4000
      )
    }
    window.addEventListener('rheoson:play-error', handler)
    return () => window.removeEventListener('rheoson:play-error', handler)
  }, [toast])
}

// ── Inner app — hooks that need router context ────────────────
function AppInner() {
  useKeyboardShortcuts()
  useMediaSession()
  usePlayerErrorToast()
  return <RouterProvider router={router} />
}

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const initTheme       = useThemeStore((s) => s.initTheme)
  const initializeAuth  = useAuthStore((s) => s.initialize)
  const { show, dismiss } = useSplash()

  // Apply saved theme on mount
  useEffect(() => {
    initTheme()
  }, [initTheme])

  // Validate stored auth token on mount
  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  // Unlock Web Audio context on first user gesture
  // Required on mobile browsers — audio won't play until unlocked
  useEffect(() => {
    const unlock = () => {
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume().catch(() => {})
      }
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('touchend',   unlock)
      document.removeEventListener('click',      unlock)
      document.removeEventListener('keydown',    unlock)
    }

    document.addEventListener('touchstart', unlock, { passive: true })
    document.addEventListener('touchend',   unlock, { passive: true })
    document.addEventListener('click',      unlock)
    document.addEventListener('keydown',    unlock)

    return () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('touchend',   unlock)
      document.removeEventListener('click',      unlock)
      document.removeEventListener('keydown',    unlock)
    }
  }, [])

  return (
    <>
      <AnimatePresence>
        {show && <SplashScreen onDone={dismiss} />}
      </AnimatePresence>
      {!show && <AppInner />}
    </>
  )
}