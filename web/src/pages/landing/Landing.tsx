import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '@clerk/clerk-react'
import { useAuthStore } from '@/store/auth.store'
import { APP_NAME, isClerkEnabled } from '@/lib/constants'
import AppLogo from '@/components/ui/AppLogo'

/**
 * Entry screen for signed-out users.
 *
 * Deliberately minimal: one button, one destination. There is no separate
 * sign-in / sign-up choice — Clerk's own flow handles both and lets the user
 * switch between them, so mirroring that choice here only added a step.
 *
 * Flow: this screen → /auth (Clerk) → Home.
 */
export default function Landing() {
  return isClerkEnabled() ? <ClerkGate /> : <GateBody clerkEnabled={false} />
}

/** Renders inside ClerkProvider only — safe to call Clerk hooks here. */
function ClerkGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoaded, isSignedIn } = useAuth()
  const authed = isLoaded && isSignedIn

  // One-way escape so /landing never traps an already signed-in user:
  // at "/" the AuthGuard already routes them into the app.
  useEffect(() => {
    if (authed && location.pathname === '/landing') {
      navigate('/', { replace: true })
    }
  }, [authed, location.pathname, navigate])

  return <GateBody clerkEnabled authed={authed} />
}

interface GateBodyProps {
  clerkEnabled: boolean
  authed?: boolean
}

function GateBody({ clerkEnabled, authed = false }: GateBodyProps) {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const effectiveAuthed = clerkEnabled ? authed : isAuthenticated

  useEffect(() => {
    if (effectiveAuthed) navigate('/', { replace: true })
  }, [effectiveAuthed, navigate])

  if (effectiveAuthed) return null

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] px-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] opacity-[0.08] blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="relative flex w-full max-w-xs flex-col items-center text-center"
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, type: 'spring', damping: 20 }}
          className="mb-6"
        >
          <AppLogo size="2xl" glow />
        </motion.div>

        <h1 className="text-3xl font-black tracking-tight text-[var(--text-primary)]">
          {APP_NAME}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Stream from YouTube Music, download to your device, and listen offline.
        </p>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/auth')}
          className="mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent)] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-brand/25 transition-shadow hover:shadow-xl hover:shadow-brand/35"
        >
          Continue with Clerk
          <ArrowRight className="h-4 w-4" />
        </motion.button>

        <p className="mt-3 text-[11px] text-[var(--text-muted)]/70">
          {clerkEnabled
            ? 'Sign in or create an account — free, no subscription'
            : 'Local mode — no account needed'}
        </p>
      </motion.div>
    </div>
  )
}
