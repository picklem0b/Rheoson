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
 *  pill    — floating glass capsule, rounded ends, subtle shadow
 *  flat    — solid edge-to-edge bar with a top hairline
 *  minimal — floating capsule with icons only
 *
 * Position (bottom / top) is handled by RootLayout.
 */
export default function BottomNav() {
  const navStyle = useUIStore((s) => s.navStyle)
  const minimal = navStyle === 'minimal'

  return (
    <div className="w-full flex items-center justify-center h-full">
      <div
        className={cn(
          'flex items-center transition-all duration-300',
          navStyle === 'pill' &&
            'w-full mx-3 glass-strong rounded-[2rem] shadow-2xl border border-[var(--border)] px-1 py-1',
          navStyle === 'flat' &&
            'w-full h-full bg-[var(--bg-surface)] border-t border-[var(--border)] px-1',
          minimal &&
            'glass-strong rounded-full shadow-2xl border border-[var(--border)] px-1.5 py-1 gap-0.5'
        )}
      >
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} className="flex-1 min-w-0">
            {({ isActive }) => (
              <motion.div
                whileTap={{ scale: 0.88 }}
                animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                className={cn(
                  'relative flex flex-col items-center justify-center transition-colors duration-300',
                  minimal ? 'py-1.5 gap-0' : 'py-2 gap-0.5',
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                )}
                title={minimal ? label : undefined}
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
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
