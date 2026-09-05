import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Mail, Calendar, Music2, Clock, Heart, TrendingUp,
  ChevronRight, LogOut, Settings, Palette, HardDrive,
  Pencil, Check, X, Shield, BarChart3,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { analyticsApi } from '@/api/analytics.api'
import { tracksApi } from '@/api/tracks.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { formatCount } from '@/lib/formatters'
import { cn } from '@/lib/utils'

// ── Avatar ─────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  'from-violet-600 to-fuchsia-500',
  'from-blue-600 to-cyan-500',
  'from-emerald-600 to-teal-500',
  'from-rose-600 to-pink-500',
  'from-amber-600 to-orange-500',
  'from-indigo-600 to-purple-500',
]

function getAvatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? 'U').toUpperCase()
}

// ── Stat card ──────────────────────────────────────────────────

function ProfileStat({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]/50">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', color ?? 'bg-[var(--accent-subtle)]')}>
        <Icon className="w-4 h-4 text-[var(--accent)]" />
      </div>
      <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
      <p className="text-[10px] text-[var(--text-muted)] font-medium">{label}</p>
    </div>
  )
}

// ── Quick link ─────────────────────────────────────────────────

function QuickLink({ icon: Icon, label, description, to, color }: {
  icon: React.ElementType
  label: string
  description: string
  to: string
  color?: string
}) {
  const navigate = useNavigate()
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors text-left"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color ?? 'var(--accent)' }}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-muted)] truncate">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--text-muted)]/40 flex-shrink-0" />
    </motion.button>
  )
}

// ── Main page ──────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [saving, setSaving] = useState(false)

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
    queryKey: ['tracks', 'liked', 'count'],
    queryFn: tracksApi.getLikedCount,
    staleTime: 60_000,
    retry: 0,
  })

  const displayName = user?.name ?? 'Your account'
  const email = user?.email ?? ''
  const initials = getInitials(displayName)
  const gradient = getAvatarGradient(displayName)

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

  const startEditName = () => {
    setNameValue(displayName)
    setEditingName(true)
  }

  const cancelEdit = () => {
    setEditingName(false)
    setNameValue('')
  }

  const saveName = async () => {
    if (!nameValue.trim() || nameValue.trim() === displayName) {
      setEditingName(false)
      return
    }
    setSaving(true)
    try {
      const { authApi } = await import('@/api/auth.api')
      await authApi.updateProfile({ name: nameValue.trim() })
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, name: nameValue.trim() } : null,
      }))
      setEditingName(false)
    } catch {
      // Silently fail
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-4 lg:px-8 pt-6 pb-10 space-y-6 max-w-2xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Profile</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Your Rheoson account</p>
        </motion.div>

        {/* Avatar + Name card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[24px] overflow-hidden border border-[var(--border)]/30 bg-[var(--bg-surface)]"
        >
          {/* Gradient banner */}
          <div className={cn('h-28 bg-gradient-to-br relative', gradient)}>
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute right-4 top-3 opacity-20">
              <Music2 className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Avatar + info */}
          <div className="px-5 pb-5 -mt-10 relative">
            <div className="relative inline-block">
              {user?.image_url ? (
                <img
                  src={user.image_url}
                  alt={displayName}
                  className="w-[88px] h-[88px] rounded-[22px] object-cover border-4 border-[var(--bg-surface)] shadow-xl"
                />
              ) : (
                <div
                  className={cn(
                    'w-[88px] h-[88px] rounded-[22px] flex items-center justify-center',
                    'text-3xl font-black text-white border-4 border-[var(--bg-surface)] shadow-xl',
                    'bg-gradient-to-br',
                    gradient,
                  )}
                >
                  {initials}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-500 border-[3px] border-[var(--bg-surface)]" />
            </div>

            <div className="mt-3">
              <AnimatePresence mode="wait" initial={false}>
                {editingName ? (
                  <motion.div
                    key="editing"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-2"
                  >
                    <input
                      autoFocus
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName()
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="flex-1 h-10 px-3 text-lg font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--accent)] text-[var(--text-primary)] outline-none"
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={saveName}
                      disabled={saving}
                      className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center"
                    >
                      <Check className="w-5 h-5 text-white" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={cancelEdit}
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
                    className="flex items-center gap-2"
                  >
                    <h2 className="text-2xl font-black text-[var(--text-primary)] truncate">
                      {displayName}
                    </h2>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={startEditName}
                      className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              {email && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text-muted)]">{email}</span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Signed in
                </div>

                {memberSince && (
                  <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                    <Calendar className="w-3 h-3" />
                    Member since {memberSince}
                  </div>
                )}
              </div>
            </div>
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
            <ProfileStat icon={Music2} label="Library" value={formatCount(trackCount)} />
            <ProfileStat icon={Heart} label="Liked" value={formatCount(likedCount ?? 0)} />
            <ProfileStat icon={TrendingUp} label="Plays" value={formatCount(stats?.total_plays ?? 0)} />
            <ProfileStat icon={Clock} label="Hours" value={stats?.estimated_listening_hours ?? 0} />
            <ProfileStat icon={BarChart3} label="7-day plays" value={stats?.plays_7d ?? 0} />
            <ProfileStat icon={Calendar} label="Active days" value={stats?.active_days_30d ?? 0} />
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
            <QuickLink icon={BarChart3} label="Listening stats" description="Detailed charts and insights" to="/settings" color="#8B5CF6" />
            <QuickLink icon={Palette} label="Appearance" description="Theme, accent, transparency" to="/settings" color="#3B82F6" />
            <QuickLink icon={HardDrive} label="Storage" description="Music directories, cache" to="/settings" color="#F97316" />
            <QuickLink icon={Shield} label="Privacy" description="History, data, legal" to="/settings" color="#6B7280" />
            <QuickLink icon={Settings} label="All settings" description="Configure Rheoson" to="/settings" color="#14B8A6" />
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
              <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <LogOut className="w-4 h-4 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-400">Sign out</p>
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
