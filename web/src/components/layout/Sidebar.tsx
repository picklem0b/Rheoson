import { NavLink, useNavigate } from 'react-router-dom'
import { House, MagnifyingGlass, Books, DownloadSimple, GearSix, UserCircle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { useUser } from '@clerk/clerk-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { isClerkEnabled } from '@/lib/constants'
import ShortcutsModal from '@/components/ui/ShortcutsModal'

const NAV_ITEMS = [
  { to: '/', icon: House, label: 'House' },
  { to: '/search', icon: MagnifyingGlass, label: 'MagnifyingGlass' },
  { to: '/library', icon: Books, label: 'Books' },
  { to: '/downloads', icon: DownloadSimple, label: 'My Music' },
  { to: '/settings', icon: GearSix, label: 'Settings' },
]

/** Sidebar icon size token — matches the BottomNav rhythm. */
const ICON_SIZE = 20

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
  if (!isClerkEnabled()) return <LocalProfileButton navigate={navigate} />
  return <ClerkProfileButton navigate={navigate} />
}

/**
 * Split by Clerk configuration — useUser() throws "can only be used within
 * <ClerkProvider />" whenever auth is not mounted for this render (keyless
 * build, or the runtime guard having degraded the app to local mode), and
 * this component renders inside the shared layout, which is not wrapped by
 * the provider in that case.
 */
function ClerkProfileButton({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { user: clerkUser } = useUser()
  const localUser = useAuthStore((s) => s.user)

  const name = clerkUser?.fullName ?? clerkUser?.username ?? localUser?.name ?? 'Your account'
  const imageUrl = clerkUser?.imageUrl ?? localUser?.image_url
  return <ProfileButtonBody navigate={navigate} name={name} imageUrl={imageUrl} />
}

function LocalProfileButton({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const localUser = useAuthStore((s) => s.user)
  return (
    <ProfileButtonBody
      navigate={navigate}
      name={localUser?.name ?? 'Your account'}
      imageUrl={localUser?.image_url}
    />
  )
}

function ProfileButtonBody({
  navigate,
  name,
  imageUrl,
}: {
  navigate: ReturnType<typeof useNavigate>
  name: string
  imageUrl?: string
}) {
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
        <div
          className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold text-white bg-gradient-to-br flex-shrink-0',
            gradient
          )}
        >
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{name}</p>
        <p className="text-[10px] text-[var(--text-muted)] truncate">View profile</p>
      </div>
      <UserCircle size={16} className="text-[var(--text-muted)] flex-shrink-0" aria-hidden />
    </motion.button>
  )
}

/** Desktop-only sidebar. Hidden on mobile via RootLayout's breakpoint, and
 *  never mounted inside the native shell (see RootLayout). */
export default function Sidebar() {
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="flex flex-col w-[var(--sidebar-width)] h-full bg-[var(--bg-surface)] border-r border-[var(--border)] py-6 px-3 gap-1"
    >
      {/* ── Logo ─────────────────────────────────────────── */}
      <NavLink to="/" className="flex items-center gap-2.5 px-3 mb-6 group">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="flex items-center gap-2.5">
          <img
            src="/assets/logo.png"
            alt="Rheoson"
            className="w-9 h-9 rounded-2xl object-cover shadow-[var(--shadow-glow)]"
          />
          <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
            Rheoson
          </span>
        </motion.div>
      </NavLink>

      {/* ── Nav items ─────────────────────────────────────── */}
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          {({ isActive }) => (
            <motion.div
              whileTap={{ scale: 0.97 }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors duration-200',
                isActive
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
              )}
            >
              <Icon
                size={ICON_SIZE}
                weight={isActive ? 'fill' : 'regular'}
                className="flex-shrink-0"
                aria-hidden
              />
              <span className={cn('text-sm font-medium', isActive && 'text-[var(--accent)]')}>
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
