import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { EnvelopeSimple, Calendar, MusicNotes, Clock, Heart, TrendUp, CaretRight, SignOut, GearSix, Palette, HardDrives, Pencil, Check, X, Shield, ChartLineUp, Flame, Medal, Camera, UserCircle } from '@phosphor-icons/react'
import { useAuthStore } from '@/store/auth.store'
import { useAuth as useClerkAuth } from '@clerk/clerk-react'
import { analyticsApi } from '@/api/analytics.api'
import { tracksApi } from '@/api/tracks.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { formatCount } from '@/lib/formatters'
import { qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { isClerkEnabled } from '@/lib/constants'
import { useIsGuest } from '@/hooks/useIsGuest'
import { requestAuth } from '@/lib/authGate'

// ── Avatar ─────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? 'U').toUpperCase()
}

// ── Backdrop (kept on this device) ─────────────────────────────

const BACKDROP_KEY = 'rheoson-profile-backdrop'

function readBackdrop(): string | null {
  try { return localStorage.getItem(BACKDROP_KEY) } catch { return null }
}

/** Downscale to ≤1200px wide JPEG so it fits comfortably in localStorage. */
function fileToBackdrop(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1200 / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')) }
    img.src = url
  })
}

// ── Stat card ──────────────────────────────────────────────────

function ProfileStat({ icon: Icon, label, value }: {
  icon: React.ElementType
  label: string
  value: string | number
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--accent-subtle)]">
        <Icon className="w-4 h-4 text-[var(--accent)]" />
      </div>
      <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
      <p className="text-[10px] text-[var(--text-muted)] font-medium">{label}</p>
    </div>
  )
}

// ── Quick link ─────────────────────────────────────────────────

function QuickLink({ icon: Icon, label, description, to }: {
  icon: React.ElementType
  label: string
  description: string
  to: string
}) {
  const navigate = useNavigate()
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--accent-subtle)]">
        <Icon className="w-4 h-4 text-[var(--accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-muted)] truncate">{description}</p>
      </div>
      <CaretRight className="w-4 h-4 text-[var(--text-muted)]/40 flex-shrink-0" />
    </motion.button>
  )
}

// ── Main page ──────────────────────────────────────────────────

export default function Profile() {
  const guest = useIsGuest()
  if (guest) return <GuestProfile />
  if (!isClerkEnabled()) return <LocalProfile />
  return <ClerkProfile />
}

function GuestProfile() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--bg-elevated)] border border-[var(--border)]">
        <UserCircle className="h-14 w-14 text-[var(--text-muted)]" />
      </div>
      <div>
        <h1 className="text-2xl font-black text-[var(--text-primary)]">Guest</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Sign in to save songs, build playlists, chat with friends and see your listening stats.
        </p>
      </div>
      <button
        onClick={() => void requestAuth('Sign in to set up your profile')}
        className="rounded-2xl bg-[var(--accent)] px-8 py-3 text-sm font-bold text-white shadow-lg active:scale-[0.98]"
      >
        Sign in
      </button>
    </div>
  )
}

/**
 * Split by build-time Clerk configuration. useUser()/useAuth() throw
 * "can only be used within <ClerkProvider />" when the bundle was built
 * without VITE_CLERK_PUBLISHABLE_KEY — the provider isn't mounted in
 * that build, so the Clerk-hook variants must never render there.
 */
function ProfileBody({ signOut }: { signOut?: () => Promise<void> }) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameValue, setUsernameValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [backdrop, setBackdrop] = useState<string | null>(readBackdrop)
  const backdropInput = useRef<HTMLInputElement>(null)

  const saveBackdrop = (value: string | null) => {
    setBackdrop(value)
    try {
      if (value) localStorage.setItem(BACKDROP_KEY, value)
      else localStorage.removeItem(BACKDROP_KEY)
    } catch { /* storage full or blocked — the backdrop stays for this session */ }
  }

  // Stats from analytics API
  const { data: stats } = useQuery({
    queryKey: ['analytics', 'stats'],
    queryFn: analyticsApi.getStats,
    staleTime: 60_000,
    retry: false,
  })

  // Library count
  const { data: libraryTracks } = useQuery({
    queryKey: ['tracks', 'local'],
    queryFn: () => tracksApi.getAll(),
    staleTime: 60_000,
    retry: 0,
  })

  const trackCount = libraryTracks?.length ?? 0

  // Liked count
  const { data: likedCount } = useQuery({
    queryKey: qk.likedCount(),
    queryFn: tracksApi.getLikedCount,
    staleTime: 60_000,
    retry: 0,
  })

  const displayUsername = user?.username ?? user?.email?.split('@')[0] ?? 'you'
  const email = user?.email ?? ''
  const initials = getInitials(displayUsername)

  // Format member since date
  const memberSince = useMemo(() => {
    if (!user?.created_at) return null
    try {
      const date = new Date(user.created_at)
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } catch {
      return null
    }
  }, [user?.created_at])

  const startEditUsername = () => {
    setUsernameValue(displayUsername)
    setEditingUsername(true)
  }

  const cancelEdit = () => {
    setEditingUsername(false)
    setUsernameValue('')
  }

  const saveUsername = async () => {
    if (!usernameValue.trim() || usernameValue.trim() === displayUsername) {
      setEditingUsername(false)
      return
    }
    setSaving(true)
    try {
      const { authApi } = await import('@/api/auth.api')
      await authApi.updateProfile({ username: usernameValue.trim() })
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, username: usernameValue.trim() } : null,
      }))
      setEditingUsername(false)
    } catch {
      // Silently fail
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    // `user` is the Clerk-synced mirror in the auth store, so a Clerk
    // session is exactly a non-null user here.
    if (signOut && user) {
      await signOut()
    }
    logout()
    navigate('/')
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-6 lg:px-8">

        {/* Profile card — identity, counts, and the two ways to change it */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--bg-surface)]"
        >
          {/* Backdrop — a band, not a canvas: the face leads the card */}
          <div
            className="relative h-28 bg-[var(--bg-elevated)] bg-cover bg-center"
            style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
          >
            {!backdrop && (
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-br from-[var(--accent-subtle)] via-transparent to-transparent"
              />
            )}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--bg-surface)] to-transparent"
            />
            <div className="absolute right-3 top-3 flex items-center gap-2">
              {backdrop && (
                <button
                  onClick={() => saveBackdrop(null)}
                  aria-label="Remove backdrop"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-base)]/60 text-[var(--text-primary)] backdrop-blur active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => backdropInput.current?.click()}
                aria-label="Change backdrop"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-base)]/60 text-[var(--text-primary)] backdrop-blur active:scale-95"
              >
                <Camera className="h-[16px] w-[16px]" />
              </button>
            </div>
            <input
              ref={backdropInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void fileToBackdrop(f).then(saveBackdrop).catch(() => {})
                e.target.value = ''
              }}
            />
          </div>

          {/* The band above is positioned, so the content has to be too —
              otherwise it paints underneath and clips the avatar. */}
          <div className="relative px-5 pb-5">
            <div className="-mt-9 flex items-end justify-between gap-3">
              {user?.image_url ? (
                <img
                  src={user.image_url}
                  alt={displayUsername}
                  className="h-[80px] w-[80px] rounded-full border-[3px] border-[var(--bg-surface)] object-cover shadow-lg"
                />
              ) : (
                <div
                  className={cn(
                    'flex h-[80px] w-[80px] items-center justify-center rounded-full',
                    'border-[3px] border-[var(--bg-surface)] bg-[var(--accent-subtle)]',
                    'text-[26px] font-black text-[var(--accent)] shadow-lg',
                  )}
                >
                  {initials}
                </div>
              )}

              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={startEditUsername}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--bg-elevated)] px-3.5 text-xs font-bold text-[var(--text-primary)] active:scale-95"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => navigate('/account')}
                  aria-label="Account settings"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-primary)] active:scale-95"
                >
                  <GearSix className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <AnimatePresence mode="wait" initial={false}>
                {editingUsername ? (
                  <motion.div
                    key="editing"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-2"
                  >
                    <input
                      autoFocus
                      value={usernameValue}
                      onChange={(e) => setUsernameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveUsername()
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="h-10 flex-1 rounded-xl border border-[var(--accent)] bg-[var(--bg-elevated)] px-3 text-lg font-bold text-[var(--text-primary)] outline-none"
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={saveUsername}
                      disabled={saving}
                      aria-label="Save username"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--success)]"
                    >
                      <Check className="h-5 w-5 text-white" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={cancelEdit}
                      aria-label="Cancel"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-elevated)]"
                    >
                      <X className="h-5 w-5 text-[var(--text-muted)]" />
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="display"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                  >
                    <h2 className="truncate text-[21px] font-black leading-tight text-[var(--text-primary)]">
                      @{displayUsername}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
                      {email && email !== displayUsername && (
                        <span className="flex min-w-0 items-center gap-1">
                          <EnvelopeSimple className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{email}</span>
                        </span>
                      )}
                      {memberSince && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                          Joined {memberSince}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Counts — the three numbers that describe the account */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border)] rounded-2xl bg-[var(--bg-elevated)] py-2.5">
              {[
                { v: formatCount(trackCount), l: 'Library' },
                { v: formatCount(likedCount ?? 0), l: 'Saved' },
                { v: formatCount(stats?.total_plays ?? 0), l: 'Plays' },
              ].map((c) => (
                <div key={c.l} className="px-2 text-center">
                  <p className="text-[17px] font-bold leading-none tabular-nums text-[var(--text-primary)]">
                    {c.v}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{c.l}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Listening — the numbers the card above does not carry */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Listening
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ProfileStat icon={Clock} label="Hours" value={stats?.estimated_listening_hours ?? 0} />
            <ProfileStat icon={ChartLineUp} label="7-day plays" value={stats?.plays_7d ?? 0} />
            <ProfileStat icon={Calendar} label="Active days" value={stats?.active_days_30d ?? 0} />
            <ProfileStat icon={Flame} label="Day streak" value={stats?.current_streak ?? 0} />
            <ProfileStat icon={Medal} label="Best streak" value={stats?.longest_streak ?? 0} />
          </div>
        </motion.div>

        {/* Quick links */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">
            Quick access
          </p>
          <div className="bg-[var(--bg-surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--border)]/40 border border-[var(--border)]/30">
            <QuickLink icon={ChartLineUp} label="Listening stats" description="Detailed charts and insights" to="/stats" />
            <QuickLink icon={TrendUp} label="Your year in review" description="Your personal Wrapped" to="/wrapped" />
            <QuickLink icon={Palette} label="Appearance" description="Theme, accent, transparency" to="/settings" />
            <QuickLink icon={HardDrives} label="Storage" description="Music directories, cache" to="/settings" />
            <QuickLink icon={Shield} label="Privacy" description="History, data, legal" to="/settings" />
            <QuickLink icon={GearSix} label="All settings" description="Configure Rheoson" to="/settings" />
          </div>
        </motion.div>

        {/* Sign out */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="bg-[var(--bg-surface)] rounded-[18px] overflow-hidden border border-[var(--border)]/30">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-[var(--danger-bg)] flex items-center justify-center flex-shrink-0">
                <SignOut className="w-4 h-4 text-[var(--danger-text)]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--danger-text)]">Sign out</p>
                <p className="text-xs text-[var(--text-muted)]">You&apos;ll need to sign in again</p>
              </div>
            </motion.button>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-center pt-4 pb-2"
        >
          <p className="text-[11px] text-[var(--text-muted)]/50">
            Rheoson · Self-hosted music streaming
          </p>
        </motion.div>
      </div>
    </ScrollArea>
  )
}

/** Clerk-mode wrapper: the only place the Clerk hooks are called. */
function ClerkProfile() {
  const { signOut } = useClerkAuth()
  return <ProfileBody signOut={signOut} />
}

/** Local-mode wrapper (bundle built without VITE_CLERK_PUBLISHABLE_KEY). */
function LocalProfile() {
  return <ProfileBody />
}
