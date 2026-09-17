import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Howler } from 'howler'
import { ClerkProvider } from '@clerk/clerk-react'
import { router } from './router'
import { useThemeStore } from '@/store/theme.store'
import { useUIStore } from '@/store/ui.store'
import { useKeyboardShortcuts } from '@/hooks/keyboardShortcuts.hook'
import { useMediaSession } from '@/hooks/mediaSession.hook'
import { useToast } from '@/components/ui/Toaster'
import SplashScreen, { useSplash } from '@/components/ui/SplashScreen'
import { startVersionCheck } from '@/lib/versionCheck'
import { NetworkErrorBanner } from '@/components/ui/NetworkErrorBanner'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { initNetwork } from '@/lib/network'
import { ENDPOINTS } from '@/lib/constants'
import { initAutoSync } from '@/lib/offlineQueue'
import { migrateOfflineAudioMime } from '@/lib/audioCacheMigration'
import { initErrorHandler } from '@/lib/errorHandler'
import { unlockAudioContext } from '@/lib/audioEffects'
import {
  CLERK_PUBLISHABLE_KEY,
  isClerkEnabled,
  disableClerkRuntime,
} from '@/lib/constants'
import ClerkUserSync, { ClerkCrashGuard } from '@/components/auth/ClerkUserSync'
import { useAuthStore } from '@/store/auth.store'
import { usePreferenceSync } from '@/hooks/preferenceSync.hook'

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
  usePreferenceSync()
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
  const { show, dismiss } = useSplash()
  const { toast } = useToast()
  // Flipped when Clerk throws during render — the app then re-renders in
  // local mode instead of showing react-router's error page.
  const [clerkFailed, setClerkFailed] = useState(false)

  // Apply saved theme + layout (font/size) prefs on mount
  useEffect(() => {
    initTheme()
    initLayout()
  }, [initTheme, initLayout])

  // Boot the auth store (validates a persisted session in local mode;
  // in Clerk mode it just flips `ready` so guards never hang on it).
  useEffect(() => {
    useAuthStore.getState().initialize()
  }, [])

  // Initialize network detection and offline sync
  useEffect(() => {
    initErrorHandler()
    initNetwork(() => {
      // Canonical URL from constants.ts — deriving the origin here again is
      // what made the poller probe a different (dead) host than the API
      // client uses, showing "offline" while search worked fine.
      return ENDPOINTS.health
    })
    initAutoSync()
    // One-time repair of offline blobs stored with the old wrong mime labels
    // (m4a bytes labeled mp3) so previously-cached tracks play again.
    migrateOfflineAudioMime().catch(() => {})
  }, [])

  // Check for app updates periodically
  useEffect(() => {
    return startVersionCheck((info) => {
      toast(`New version ${info.version} available!`, 'info');
    });
  }, [toast])

  // Unlock the Web Audio graphs on the first user gesture.
  // Both Howler's context and the DSP chain's context have to be resumed
  // inside a gesture on Android — a media element routed through a suspended
  // graph is completely silent.
  useEffect(() => {
    const detach = () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('touchend',   unlock)
      document.removeEventListener('click',      unlock)
      document.removeEventListener('keydown',    unlock)
    }

    const unlock = () => {
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume().catch(() => {})
      }
      unlockAudioContext()
      detach()
    }

    document.addEventListener('touchstart', unlock, { passive: true })
    document.addEventListener('touchend',   unlock, { passive: true })
    document.addEventListener('click',      unlock)
    document.addEventListener('keydown',    unlock)

    return detach
  }, [])

  const inner = (
    <ErrorBoundary>
      <AnimatePresence>
        {show && <SplashScreen onDone={dismiss} />}
      </AnimatePresence>
      {!show && <AppInner />}
    </ErrorBoundary>
  )

  if (isClerkEnabled() && !clerkFailed) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <ClerkCrashGuard
          onFail={() => {
            disableClerkRuntime();
            setClerkFailed(true);
          }}
        >
          <ClerkUserSync />
          {inner}
        </ClerkCrashGuard>
      </ClerkProvider>
    )
  }

  return inner
}
