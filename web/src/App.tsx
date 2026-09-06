import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Howler } from 'howler'
import { router } from './router'
import { useThemeStore } from '@/store/theme.store'
import { useUIStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useKeyboardShortcuts } from '@/hooks/keyboardShortcuts.hook'
import { useMediaSession } from '@/hooks/mediaSession.hook'
import { useToast } from '@/components/ui/Toaster'
import SplashScreen, { useSplash } from '@/components/ui/SplashScreen'
import { startVersionCheck } from '@/lib/versionCheck'
import { NetworkErrorBanner } from '@/components/ui/NetworkErrorBanner'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { initNetwork } from '@/lib/network'
import { initAutoSync } from '@/lib/offlineQueue'
import { initErrorHandler } from '@/lib/errorHandler'

// ── Player error toast ────────────────────────────────────────
function usePlayerErrorToast() {
  const { toast } = useToast()

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const message = detail?.error || 'Playback error — tap to retry'
      toast(message, 'error', 5000)
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
  return (
    <ErrorBoundary>
      <NetworkErrorBanner />
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const initTheme       = useThemeStore((s) => s.initTheme)
  const initLayout      = useUIStore((s) => s.initLayout)
  const initializeAuth  = useAuthStore((s) => s.initialize)
  const { show, dismiss } = useSplash()
  const { toast } = useToast()

  // Apply saved theme + layout (font/size) prefs on mount
  useEffect(() => {
    initTheme()
    initLayout()
  }, [initTheme, initLayout])

  // Validate stored auth token on mount
  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  // Initialize network detection and offline sync
  useEffect(() => {
    initErrorHandler()
    initNetwork(() => {
      const PROD_API = import.meta.env.VITE_API_URL ?? 'https://rheoson-api-vnny.onrender.com'
      return import.meta.env.DEV ? '/api/health' : `${PROD_API}/api/health`
    })
    initAutoSync()
  }, [])

  // Check for app updates periodically
  useEffect(() => {
    return startVersionCheck((info) => {
      toast(`New version ${info.version} available!`, 'info');
    });
  }, [toast])

  // Unlock Web Audio context on first user gesture
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
    <ErrorBoundary>
      <AnimatePresence>
        {show && <SplashScreen onDone={dismiss} />}
      </AnimatePresence>
      {!show && <AppInner />}
    </ErrorBoundary>
  )
}
