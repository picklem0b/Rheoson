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
    <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]/50">
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
      <div className="px-4 lg:px-8 pt-6 pb-10 space-y-6 max-w-2xl mx-auto">

        {/* TikTok-style header: backdrop, centred avatar, @handle, key counts */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] overflow-hidden border border-[var(--border)]/30 bg-[var(--bg-surface)]"
        >
          {/* Backdrop — your own picture, kept on this device */}
          <div
            className="h-40 relative bg-[var(--accent-subtle)] bg-cover bg-center"
            style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
          >
            {!backdrop && (
              <div className="absolute right-4 top-3 opacity-30">
                <MusicNotes className="w-8 h-8 text-[var(--accent)]" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--bg-surface)] to-transparent" aria-hidden />
            <button
              onClick={() => backdropInput.current?.click()}
              aria-label="Change backdrop"
              className="absolute right-3 top-3 h-9 w-9 rounded-full bg-black/45 backdrop-blur flex items-center justify-center text-white active:scale-95"
            >
              <Camera className="w-[18px] h-[18px]" />
            </button>
            {backdrop && (
              <button
                onClick={() => saveBackdrop(null)}
                aria-label="Remove backdrop"
                className="absolute right-14 top-3 h-9 w-9 rounded-full bg-black/45 backdrop-blur flex items-center justify-center text-white active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            )}
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

          <div className="px-5 pb-5 -mt-12 relative flex flex-col items-center text-center">
            {user?.image_url ? (
              <img
                src={user.image_url}
                alt={displayUsername}
                className="w-[96px] h-[96px] rounded-full object-cover border-4 border-[var(--bg-surface)] shadow-xl"
              />
            ) : (
              <div
                className={cn(
                  'w-[96px] h-[96px] rounded-full flex items-center justify-center',
                  'text-3xl font-black text-[var(--accent)] bg-[var(--accent-subtle)]',
                  'border-4 border-[var(--bg-surface)] shadow-xl',
                )}
              >
                {initials}
              </div>
            )}

            <div className="mt-3 w-full">
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
                      className="flex-1 h-10 px-3 text-lg font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--accent)] text-[var(--text-primary)] outline-none"
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={saveUsername}
                      disabled={saving}
                      aria-label="Save username"
                      className="w-10 h-10 rounded-xl bg-[var(--success)] flex items-center justify-center"
                    >
                      <Check className="w-5 h-5 text-white" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={cancelEdit}
                      aria-label="Cancel"
                      className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center"
                    >
                      <X className="w-5 h-5 text-[var(--text-muted)]" />
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="display"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                  >
                    <h2 className="text-[22px] font-black text-[var(--text-primary)] truncate">
                      @{displayUsername}
                    </h2>
                    {email && email !== displayUsername && (
                      <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[13px] text-[var(--text-muted)]">
                        <EnvelopeSimple className="w-3.5 h-3.5" />
                        {email}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Counts row, TikTok-style */}
            <div className="mt-4 flex items-stretch justify-center divide-x divide-[var(--border)]/50">
              {[
                { v: formatCount(trackCount), l: 'Library' },
                { v: formatCount(likedCount ?? 0), l: 'Saved' },
                { v: formatCount(stats?.total_plays ?? 0), l: 'Plays' },
              ].map((c) => (
                <div key={c.l} className="px-6">
                  <p className="text-[18px] font-bold text-[var(--text-primary)] tabular-nums">{c.v}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">{c.l}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={startEditUsername}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] px-5 py-2 text-sm font-semibold text-[var(--text-primary)] active:scale-[0.98]"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit profile
              </button>
              <button
                onClick={() => navigate('/account')}
                aria-label="Account settings"
                className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] p-2.5 text-[var(--text-primary)] active:scale-[0.98]"
              >
                <GearSix className="w-4 h-4" />
              </button>
            </div>

            {memberSince && (
              <p className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Calendar className="w-3 h-3" />
                Member since {memberSince}
              </p>
            )}
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">
            Your stats
          </p>
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat icon={MusicNotes} label="Library" value={formatCount(trackCount)} />
            <ProfileStat icon={Heart} label="Saved" value={formatCount(likedCount ?? 0)} />
            <ProfileStat icon={TrendUp} label="Plays" value={formatCount(stats?.total_plays ?? 0)} />
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
