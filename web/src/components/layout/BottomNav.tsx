import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { House, MagnifyingGlass, Books, DownloadSimple } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import ProfileSheet from '@/components/layout/ProfileSheet'

const NAV_ITEMS = [
  { to: '/', icon: House, label: 'Home' },
  { to: '/search', icon: MagnifyingGlass, label: 'Search' },
  { to: '/library', icon: Books, label: 'Library' },
  { to: '/downloads', icon: DownloadSimple, label: 'My Music' },
]

/** Icon size tokens — one rhythm across the shell (Phosphor uses px numbers). */
const ICON_SIZE = 22

function AvatarButton({ onClick }: { onClick: () => void }) {
  const user = useAuthStore((s) => s.user)
  const name = user?.username ?? 'You'

  if (user?.image_url) {
    return (
      <button
        onClick={onClick}
        aria-label='Profile and settings'
        className='relative z-10 w-8 h-8 rounded-full overflow-hidden flex-shrink-0
                   ring-1 ring-[var(--border)] hover:ring-[var(--accent)] transition-all'>
        <img src={user.image_url} alt={name} className='w-full h-full object-cover' />
      </button>
    )
  }

  // Initials fallback — same treatment as the ProfileRow avatars.
  const initials = name.trim().slice(0, 2).toUpperCase()
  return (
    <button
      onClick={onClick}
      aria-label='Profile and settings'
      className='relative z-10 w-8 h-8 rounded-full flex-shrink-0
                 bg-gradient-to-br from-violet-600 to-fuchsia-500
                 flex items-center justify-center text-[11px] font-black text-white
                 ring-1 ring-[var(--border)] hover:ring-[var(--accent)] transition-all'>
      {initials}
    </button>
  )
}

/**
 * Mobile navigation bar — style comes from Settings → Layout → Navigation style:
 *
 *  pill    — floating glass capsule with a sliding active indicator
 *  flat    — solid edge-to-edge bar with a top hairline
 *  minimal — floating capsule, icons only
 *
 * The active tab gets an animated pill that slides between items
 * (shared layoutId), tinted with the accent colour. Position
 * (bottom / top) is handled by RootLayout.
 *
 * The old gear entry is gone: the profile picture opens the profile
 * sheet, which carries Settings, Listening stats, About, Privacy and
 * Account. Touch targets stay ≥44px tall regardless of style.
 */
export default function BottomNav() {
  const navStyle = useUIStore((s) => s.navStyle)
  const minimal = navStyle === 'minimal'
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <div className="w-full flex items-center justify-center h-full px-3">
        <div
          className={cn(
            'flex items-center transition-all duration-300',
            navStyle === 'pill' &&
              'w-full my-1 rounded-full glass-strong px-1.5 py-1 shadow-[var(--shadow-lg)]',
            navStyle === 'flat' &&
              'w-full h-full bg-[var(--bg-surface)] border-t border-[var(--border)] px-1',
            minimal &&
              'my-1 glass-strong rounded-full px-2 py-1 gap-0.5 shadow-[var(--shadow-lg)]'
          )}
        >
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className="flex-1 min-w-0">
              {({ isActive }) => (
                <div
                  className={cn(
                    'relative flex items-center justify-center transition-colors duration-300',
                    minimal ? 'py-1' : 'py-1.5',
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                  )}
                  title={minimal ? label : undefined}
                >
                  {/* Sliding active indicator — shared layoutId animates
                      the pill gliding from tab to tab */}
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-indicator"
                      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                      className={cn(
                        'absolute inset-0 rounded-full',
                        minimal
                          ? 'bg-[var(--accent-subtle)]'
                          : 'bg-[var(--accent-subtle)] border border-[var(--accent-border)]'
                      )}
                    />
                  )}

                  <div
                    className={cn(
                      'relative z-10 flex flex-col items-center justify-center',
                      minimal ? 'gap-0' : 'gap-0.5'
                    )}
                  >
                    <Icon
                      weight={isActive ? 'fill' : 'regular'}
                      size={ICON_SIZE}
                      className={cn(
                        'relative z-10 transition-all duration-300',
                        isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                      )}
                      aria-hidden
                    />
                    {!minimal && (
                      <span
                        className={cn(
                          'relative z-10 text-[10px] font-semibold transition-all duration-300 leading-none',
                          isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                        )}
                      >
                        {label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </NavLink>
          ))}

          {/* Profile picture — the way into settings and everything personal */}
          <div className={cn('flex items-center justify-center flex-1 min-w-0', minimal ? 'py-1' : 'py-1.5')}>
            <AvatarButton onClick={() => setSheetOpen(true)} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {sheetOpen && <ProfileSheet onClose={() => setSheetOpen(false)} />}
      </AnimatePresence>
    </>
  )
}
