import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Music, Headphones, Download, WifiOff } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useAuthStore } from '@/store/auth.store'
import { CLERK_PUBLISHABLE_KEY } from '@/lib/constants'

const features = [
  {
    icon: Headphones,
    title: 'Stream anything',
    description: 'Search YouTube Music and play any song instantly — no subscription needed.',
    color: 'from-violet-500 to-fuchsia-500',
  },
  {
    icon: Download,
    title: 'Download & own',
    description: 'Save tracks locally as MP3, FLAC, or any format. Listen offline, forever.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: WifiOff,
    title: 'Works offline',
    description: 'Your library, playlists, and queue — all available without an internet connection.',
    color: 'from-emerald-500 to-teal-500',
  },
]

/**
 * Landing page — public marketing / entry screen shown to signed-out users.
 * "Get started" hands off to Clerk's own Sign up / Sign in UI (/register, /login).
 *
 * Clerk hooks live only in <ClerkGate> so this page never calls useAuth()
 * outside a <ClerkProvider> (which only exists when the key is configured).
 */
export default function Landing() {
  const clerkEnabled = !!CLERK_PUBLISHABLE_KEY
  return clerkEnabled ? <ClerkGate /> : <LandingBody clerkEnabled={false} />
}

/** Renders inside ClerkProvider only — safe to call Clerk hooks here. */
function ClerkGate() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn } = useAuth()
  const authed = isLoaded && isSignedIn

  useEffect(() => {
    if (authed) navigate('/', { replace: true })
  }, [authed, navigate])

  return <LandingBody clerkEnabled authed={authed} />
}

interface LandingBodyProps {
  clerkEnabled: boolean
  authed?: boolean
}

function LandingBody({ clerkEnabled, authed = false }: LandingBodyProps) {
  const navigate = useNavigate()

  // Local-mode store check (no Clerk) — if a stored session exists, go home.
  const { isAuthenticated } = useAuthStore()
  const effectiveAuthed = clerkEnabled ? authed : isAuthenticated

  useEffect(() => {
    if (effectiveAuthed) navigate('/', { replace: true })
  }, [effectiveAuthed, navigate])

  if (effectiveAuthed) return null

  return (
    <div className="min-h-screen bg-[var(--bg-base)] overflow-hidden">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="relative px-6 pt-16 pb-20 max-w-2xl mx-auto text-center">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[var(--accent)] opacity-[0.07] rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', damping: 20 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[var(--accent)] shadow-lg shadow-[var(--accent)]/20 mb-8"
          >
            <Music className="w-10 h-10 text-white" />
          </motion.div>

          <h1 className="text-5xl sm:text-6xl font-black text-[var(--text-primary)] tracking-tight leading-[1.1]">
            Your music.
            <br />
            <span className="bg-gradient-to-r from-[var(--accent)] to-purple-400 bg-clip-text text-transparent">
              Your rules.
            </span>
          </h1>

          <p className="mt-5 text-lg text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            Stream from YouTube, download to your device, and listen offline.
            No subscription. No ads. No limits.
          </p>

          {/* CTA — opens Clerk's own sign-in / sign-up UI */}
          <motion.div
            className="mt-8 flex flex-col items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(clerkEnabled ? '/register' : '/auth')}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-lg shadow-lg shadow-[var(--accent)]/25 hover:shadow-xl hover:shadow-[var(--accent)]/30 transition-shadow"
            >
              Get started
              <ArrowRight className="w-5 h-5" />
            </motion.button>

            {clerkEnabled ? (
              <button
                onClick={() => navigate('/login')}
                className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Already have an account? Sign in
              </button>
            ) : (
              <p className="text-xs text-[var(--text-muted)]/60">
                Local mode — no account needed
              </p>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* ── Features ─────────────────────────────────────────── */}
      <div className="px-6 pb-20 max-w-2xl mx-auto">
        <div className="space-y-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-start gap-4 p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]/30"
            >
              <div
                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0`}
              >
                <feature.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-[var(--text-primary)]">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
