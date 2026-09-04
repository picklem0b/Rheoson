import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

// ── Avatar helpers (mirror of Sidebar's profile button) ───────

const AVATAR_GRADIENTS = [
  'from-violet-600 to-fuchsia-500',
  'from-blue-600 to-cyan-500',
  'from-emerald-600 to-teal-500',
  'from-rose-600 to-pink-500',
  'from-amber-600 to-orange-500',
]

function getGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] ?? 'U').toUpperCase()
}

/**
 * Profile summary card — shown pinned above the Settings groups.
 * Opens the Profile page; guests get the same entry point so they can
 * sign in from there.
 */
export function ProfileRow() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const name = user?.name ?? 'Guest'
  const initials = getInitials(name)
  const gradient = getGradient(name)

  return (
    <motion.button
      whileTap={{ scale: 0.98, opacity: 0.8 }}
      onClick={() => navigate('/profile')}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[18px] text-left
                 bg-[var(--bg-surface)] border border-[var(--border)]/30
                 hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]/60
                 transition-colors duration-150 group"
    >
      {user?.image_url ? (
        <img
          src={user.image_url}
          alt={name}
          className="w-10 h-10 rounded-xl object-cover flex-shrink-0 shadow-md"
        />
      ) : (
        <div
          className={cn(
            'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center',
            'text-[13px] font-black text-white flex-shrink-0 shadow-md',
            gradient
          )}
        >
          {initials}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-[var(--text-primary)] truncate leading-snug">
          {name}
        </p>
        <p className="text-[12px] text-[var(--text-muted)] truncate leading-snug mt-[2px]">
          {isAuthenticated
            ? user?.email ?? 'View profile'
            : 'Guest mode — sign in to sync'}
        </p>
      </div>

      <div className="w-7 h-7 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]
                      flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--bg-overlay)] transition-colors">
        <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
      </div>
    </motion.button>
  )
}
