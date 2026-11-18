import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSignIn, useSignUp } from '@clerk/clerk-react'
import { X, ArrowLeft, CircleNotch } from '@phosphor-icons/react'
import { isClerkEnabled } from '@/lib/constants'
import { settleAuth, useAuthPrompt } from '@/lib/authGate'
import { GoogleIcon, GitHubIcon, AppleIcon } from './BrandIcons'

/**
 * Sign-in card — a centred modal, never a page.
 *
 * Providers (Google / GitHub / Apple) sit in one row; below them, an email or
 * username gets a 6-digit code from Clerk. Pasting the code finishes sign-in,
 * the card closes, and whatever the user was trying to do carries on
 * (see lib/authGate + the API client's guest gate).
 */

type OAuthStrategy = 'oauth_google' | 'oauth_github' | 'oauth_apple'
type Step = 'identify' | 'code'
type Flow = 'sign-in' | 'sign-up'

interface ClerkLikeError {
  errors?: Array<{ code?: string; longMessage?: string; message?: string }>
}

function errorCode(e: unknown): string | undefined {
  return (e as ClerkLikeError)?.errors?.[0]?.code
}
function errorText(e: unknown): string {
  const first = (e as ClerkLikeError)?.errors?.[0]
  return first?.longMessage ?? first?.message ?? 'Something went wrong. Try again.'
}

export default function AuthCard() {
  const open = useAuthPrompt((s) => s.open)
  if (!open) return null
  return isClerkEnabled() ? <ClerkCard /> : <UnavailableCard />
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  // Escape closes — and the Android back button too, via the same event the
  // app's back handler dispatches before it navigates.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && settleAuth(false)
    const onBack = (e: Event) => {
      e.preventDefault()
      settleAuth(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('rheoson:back', onBack)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('rheoson:back', onBack)
    }
  }, [])

  return (
    <AnimatePresence>
      <motion.div
        key="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm"
        onClick={() => settleAuth(false)}
      />
      <motion.div
        key="card"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="fixed left-1/2 top-1/2 z-[91] w-[calc(100%-32px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2
                   rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-2xl"
      >
        <button
          onClick={() => settleAuth(false)}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-8 text-[20px] font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">{subtitle}</p>
        <div className="mt-5">{children}</div>
      </motion.div>
    </AnimatePresence>
  )
}

function UnavailableCard() {
  return (
    <Shell title="Accounts unavailable" subtitle="This instance runs in local mode — there is no identity provider connected.">
      <button
        onClick={() => settleAuth(false)}
        className="w-full rounded-2xl bg-[var(--bg-elevated)] py-3 text-sm font-semibold text-[var(--text-primary)]"
      >
        OK
      </button>
    </Shell>
  )
}

function ClerkCard() {
  const reason = useAuthPrompt((s) => s.reason)
  const { isLoaded: siLoaded, signIn, setActive } = useSignIn()
  const { isLoaded: suLoaded, signUp } = useSignUp()

  const [step, setStep] = useState<Step>('identify')
  const [flow, setFlow] = useState<Flow>('sign-in')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  const ready = siLoaded && suLoaded

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  const oauth = async (strategy: OAuthStrategy) => {
    if (!signIn) return
    setError(null)
    try {
      // OAuth leaves the page, so we come back to the same screen.
      const back = window.location.pathname + window.location.search
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: back,
      })
    } catch (e) {
      setError(errorText(e))
    }
  }

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = identifier.trim()
    if (!id || !signIn || !signUp) return
    setBusy(true)
    setError(null)
    try {
      try {
        const attempt = await signIn.create({ identifier: id })
        const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === 'email_code')
        if (!factor || !('emailAddressId' in factor)) {
          throw new Error('This account cannot sign in with an email code.')
        }
        await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId })
        setFlow('sign-in')
      } catch (err) {
        // Unknown email → create the account with the same code step.
        if (errorCode(err) === 'form_identifier_not_found' && id.includes('@')) {
          await signUp.create({ emailAddress: id })
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
          setFlow('sign-up')
        } else if (errorCode(err) === 'form_identifier_not_found') {
          throw new Error('No account with that username. Use your email to sign up.')
        } else {
          throw err
        }
      }
      setStep('code')
    } catch (err) {
      setError(err instanceof Error && !errorCode(err) ? err.message : errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value: string) => {
    if (!signIn || !signUp || value.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      if (flow === 'sign-in') {
        const r = await signIn.attemptFirstFactor({ strategy: 'email_code', code: value })
        if (r.status === 'complete') {
          await setActive?.({ session: r.createdSessionId })
          settleAuth(true)
          return
        }
        setError('Sign-in needs another step that this card cannot show. Try a provider instead.')
      } else {
        const r = await signUp.attemptEmailAddressVerification({ code: value })
        if (r.status === 'complete') {
          await setActive?.({ session: r.createdSessionId })
          settleAuth(true)
          return
        }
        setError('Your account needs more details to finish sign-up.')
      }
    } catch (err) {
      setError(errorText(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const onCodeChange = (raw: string) => {
    // Accept pasted "123 456" / "123-456" as well as typed digits.
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) void verify(digits)
  }

  const providers: Array<{ id: OAuthStrategy; label: string; icon: React.ReactNode }> = [
    { id: 'oauth_google', label: 'Continue with Google', icon: <GoogleIcon className="h-5 w-5" /> },
    { id: 'oauth_github', label: 'Continue with GitHub', icon: <GitHubIcon className="h-5 w-5" /> },
    { id: 'oauth_apple', label: 'Continue with Apple', icon: <AppleIcon className="h-5 w-5" /> },
  ]

  if (step === 'code') {
    return (
      <Shell title="Enter your code" subtitle={`We sent a 6-digit code to ${identifier.trim()}.`}>
        <input
          ref={codeRef}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          maxLength={12}
          aria-label="6-digit code"
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 text-center text-2xl font-bold tracking-[0.5em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        {error && <p role="alert" className="mt-3 text-[13px] text-[var(--danger,#ef4444)]">{error}</p>}
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => { setStep('identify'); setCode(''); setError(null) }}
            className="flex items-center gap-1 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          {busy && <CircleNotch className="h-4 w-4 animate-spin text-[var(--accent)]" />}
        </div>
      </Shell>
    )
  }

  return (
    <Shell title="Sign in to Rheoson" subtitle={reason ?? 'Sign in to like songs, make playlists and chat with friends.'}>
      <div className="grid grid-cols-3 gap-2.5">
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => void oauth(p.id)}
            disabled={!ready}
            aria-label={p.label}
            title={p.label}
            className="flex h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] active:scale-[0.97] disabled:opacity-50"
          >
            {p.icon}
          </button>
        ))}
      </div>

      <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        or
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <form onSubmit={sendCode} className="space-y-3">
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="Email or username"
          aria-label="Email or username"
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
        />
        {error && <p role="alert" className="text-[13px] text-[var(--danger,#ef4444)]">{error}</p>}
        <button
          type="submit"
          disabled={!ready || busy || !identifier.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3 text-[15px] font-bold text-white transition-opacity disabled:opacity-50"
        >
          {busy && <CircleNotch className="h-4 w-4 animate-spin" />}
          Email me a code
        </button>
      </form>
    </Shell>
  )
}
