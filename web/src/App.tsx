import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Howler } from 'howler'
import { router } from './router'
import { useThemeStore } from '@/store/themeStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useMediaSession } from '@/hooks/useMediaSession'
import SplashScreen, { useSplash } from '@/components/ui/SplashScreen'

// ── Inner app — hooks that need router context ────────────────
function AppInner() {
  useKeyboardShortcuts()
  useMediaSession()
  return <RouterProvider router={router} />
}

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const initTheme       = useThemeStore((s) => s.initTheme)
  const { show, dismiss } = useSplash()

  // Apply saved theme on mount
  useEffect(() => {
    initTheme()
  }, [initTheme])

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