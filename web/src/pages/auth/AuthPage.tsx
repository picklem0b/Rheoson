import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignIn, SignUp, useUser } from '@clerk/clerk-react'
import { motion } from 'framer-motion'
import { Music } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { CLERK_PUBLISHABLE_KEY } from '@/lib/constants'
import './auth.css'

interface AuthPageProps {
  mode?: 'sign-in' | 'sign-up'
}

/**
 * Unified auth page — uses Clerk's prebuilt <SignIn>/<SignUp> when the
 * publishable key is configured. Falls back to a dev-only message when
 * Clerk is not set up.
 *
 * When Clerk is active, the component handles the full OAuth / magic-link /
 * email-password flow through Clerk's hosted UI. No custom form needed.
 */
export default function AuthPage({ mode = 'sign-in' }: AuthPageProps) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { isSignedIn } = useUser()

  // Redirect to home if already authenticated (Clerk or local)
  useEffect(() => {
    if (isAuthenticated || isSignedIn) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, isSignedIn, navigate])

  const clerkEnabled = !!CLERK_PUBLISHABLE_KEY

  if (clerkEnabled) {
    return (
      <div className="auth-page">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className="auth-form items-center"
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center">
              <Music className="w-7 h-7 text-white" />
            </div>
          </div>

          {/* Clerk prebuilt component */}
          <div className="clerk-auth-wrapper">
            {mode === 'sign-up' ? (
              <SignUp
                routing="path"
                path="/register"
                signInUrl="/login"
                afterSignUpUrl="/"
                afterSignInUrl="/"
              />
            ) : (
              <SignIn
                routing="path"
                path="/login"
                signUpUrl="/register"
                afterSignUpUrl="/"
                afterSignInUrl="/"
              />
            )}
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Fallback: Clerk not configured ──────────────────────────
  return (
    <div className="auth-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        className="auth-form"
      >
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center">
            <Music className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-[var(--text-primary)]">
              {mode === 'sign-up' ? 'Create account' : 'Welcome back'}
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {mode === 'sign-up'
                ? 'Start your music journey'
                : 'Sign in to Rheoson'}
            </p>
          </div>
        </div>

        <div className="px-4 py-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-sm font-medium text-yellow-400">
            Authentication not configured
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Set <code className="text-[var(--accent)]">VITE_CLERK_PUBLISHABLE_KEY</code> in{' '}
            <code>.env</code> to enable sign-in.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 rounded-xl bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-primary)] border border-[var(--border)]"
          >
            Continue without sign-in
          </button>
        </div>
      </motion.div>
    </div>
  )
}
