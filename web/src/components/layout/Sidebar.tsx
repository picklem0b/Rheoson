import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Search, Library, Download, Settings, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useUser } from '@clerk/clerk-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { CLERK_PUBLISHABLE_KEY } from '@/lib/constants'
import ShortcutsModal from '@/components/ui/ShortcutsModal'

const NAV_ITEMS = [
  { to: '/',          icon: Home,       label: 'Home'        },
  { to: '/search',    icon: Search,     label: 'Search'      },
  { to: '/library',   icon: Library,    label: 'Library'     },
  { to: '/downloads', icon: Download,   label: 'My Music'    },
  { to: '/settings',  icon: Settings,   label: 'Settings'    },
]

// ── Profile button ─────────────────────────────────────────────

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

function ProfileButton() {
  const navigate = useNavigate()
  const clerkEnabled = !!CLERK_PUBLISHABLE_KEY
  const { user: clerkUser } = useUser()
  const localUser = useAuthStore((s) => s.user)

  // Prefer Clerk user data when available
  const name = clerkEnabled
    ? (clerkUser?.fullName ?? clerkUser?.username ?? 'Your account')
    : (localUser?.name ?? 'Your account')
  const imageUrl = clerkEnabled ? clerkUser?.imageUrl : localUser?.image_url
  const initials = getInitials(name)
  const gradient = getGradient(name)

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate('/profile')}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl w-full hover:bg-[var(--bg-elevated)] transition-colors text-left"
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white bg-gradient-to-br flex-shrink-0', gradient)}>
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</p>
        <p className="text-[10px] text-[var(--text-muted)] truncate">View profile</p>
      </div>
      <User className="w-4 h-4 text-[var(--text-muted)]/40 flex-shrink-0" />
    </motion.button>
  )
}

/** Desktop-only sidebar. Hidden on mobile via RootLayout's `hidden lg:flex`. */
export default function Sidebar() {
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0,   opacity: 1 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="flex flex-col w-[var(--sidebar-width)] h-full bg-[var(--bg-surface)] border-r border-[var(--border)] py-6 px-3 gap-1"
    >
      {/* ── Logo ─────────────────────────────────────────── */}
      <NavLink to="/" className="flex items-center gap-2.5 px-3 mb-6 group">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2.5">
          <img
            src="/assets/logo.png"
            alt="Rheoson"
            className="w-9 h-9 rounded-2xl object-cover shadow-lg"
            style={{ boxShadow: '0 0 12px var(--accent-subtle)' }}
          />
          <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Rheoson</span>
        </motion.div>
      </NavLink>

      {/* ── Nav items ─────────────────────────────────────── */}
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          {({ isActive }) => (
            <motion.div
              whileTap={{ scale: 0.97 }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-200',
                isActive
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'stroke-[2.5]' : 'stroke-2')} />
              <span className={cn('text-sm font-semibold', isActive && 'text-[var(--accent)]')}>
                {label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent)]"
                />
              )}
            </motion.div>
          )}
        </NavLink>
      ))}
      {/* ── Bottom section ─────────────────────────────── */}
      <div className="mt-auto space-y-1">
        <ProfileButton />
        <ShortcutsModal />
      </div>
    </motion.div>
  )
}