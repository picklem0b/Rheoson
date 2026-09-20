import { useLocation, useNavigate } from 'react-router-dom'
import { SignIn, SignUp } from '@clerk/clerk-react'
import { motion } from 'framer-motion'
import { isClerkEnabled } from '@/lib/constants'
import AppLogo from '@/components/ui/AppLogo'
import './auth.css'

interface AuthPageProps {
  mode?: 'sign-in' | 'sign-up'
}

/**
 * Unified auth page — uses Clerk's prebuilt <SignUp>/<SignIn> when the
 * publishable key is configured. Clerk renders its own "Continue with…"
 * provider buttons, email/password form, and sign-in/sign-up links.
 *
 * Flow: Landing ("Continue with…") → /auth (this page) → House.
 *
 * There is deliberately NO manual redirect effect here: Clerk's
 * afterSignInUrl / afterSignUpUrl is the single source of truth for the
 * post-auth navigation. An extra navigate() on top of Clerk's own
 * redirect was what produced the landing ⇄ auth redirect loop.
 *
 * Falls back to a dev-only message when Clerk is not set up.
 */
export default function AuthPage({ mode = 'sign-up' }: AuthPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const clerkEnabled = isClerkEnabled()

  if (clerkEnabled) {
    const isSignUp = mode === 'sign-up'
    // Clerk's `path` must match the URL the component is mounted at.
    const path = location.pathname

    // Compact Clerk card: tighter type scale, smaller padding and a narrower
    // max width, so the whole form fits on a phone screen without scrolling.
    const clerkAppearance = {
      variables: {
        fontSize: '13px',
        spacingUnit: '0.8rem',
        borderRadius: '0.7rem',
      },
      layout: {
        logoPlacement: 'none' as const,
        socialButtonsVariant: 'blockButton' as const,
      },
      elements: {
        rootBox: 'width: 100%; max-width: 340px; margin: 0 auto;',
        card: 'width: 100%; box-shadow: none;',
        cardBox: 'width: 100%;',
        headerTitle: 'font-size: 1.05rem;',
        headerSubtitle: 'font-size: 0.8rem;',
        formFieldLabel: 'font-size: 0.75rem;',
        formFieldInput: 'height: 2.6rem;',
        formButtonPrimary: 'height: 2.6rem; font-size: 0.8rem;',
        socialButtonsBlockButton: 'height: 2.6rem;',
        footerActionText: 'font-size: 0.75rem;',
        footerActionLink: 'font-size: 0.75rem;',
      },
    }

    return (
      <div className="auth-page">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className="auth-form"
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 mb-4">
            <AppLogo size="lg" />
          </div>

          {/* Clerk prebuilt component */}
          <div className="clerk-auth-wrapper">
            {isSignUp ? (
              <SignUp
                routing="path"
                path={path}
                signInUrl="/login"
                afterSignUpUrl="/"
                afterSignInUrl="/"
                appearance={clerkAppearance}
              />
            ) : (
              <SignIn
                routing="path"
                path={path}
                signUpUrl="/register"
                afterSignUpUrl="/"
                afterSignInUrl="/"
                appearance={clerkAppearance}
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
          <AppLogo size="xl" glow />
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