import { NavLink } from 'react-router-dom'
import { Home, Search, Library, Download, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui.store'

const NAV_ITEMS = [
  { to: '/',          icon: Home,       label: 'Home'      },
  { to: '/search',    icon: Search,     label: 'Search'    },
  { to: '/library',   icon: Library,    label: 'Library'   },
  { to: '/downloads', icon: Download,   label: 'My Music'  },
  { to: '/settings',  icon: Settings,   label: 'Settings'  },
]

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
 */
export default function BottomNav() {
  const navStyle = useUIStore((s) => s.navStyle)
  const minimal = navStyle === 'minimal'

  return (
    <div className="w-full flex items-center justify-center h-full px-3">
      <div
        className={cn(
          'flex items-center transition-all duration-300',
          navStyle === 'pill' &&
            'w-full my-1 rounded-full glass-strong px-1.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/10',
          navStyle === 'flat' &&
            'w-full h-full bg-[var(--bg-surface)] border-t border-[var(--border)] px-1',
          minimal &&
            'my-1 glass-strong rounded-full px-2 py-1 gap-0.5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/10'
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
                    className={cn(
                      'relative z-10 transition-all duration-300',
                      minimal ? 'w-[22px] h-[22px]' : 'w-5 h-5',
                      isActive
                        ? 'text-[var(--accent)] stroke-[2.5]'
                        : 'text-[var(--text-muted)] stroke-2'
                    )}
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
      </div>
    </div>
  )
}