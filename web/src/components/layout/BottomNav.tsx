import { NavLink } from 'react-router-dom'
import { Home, Search, Library, Download, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/',          icon: Home,     label: 'Home'      },
  { to: '/search',    icon: Search,   label: 'Search'    },
  { to: '/library',   icon: Library,  label: 'Library'   },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/settings',  icon: Settings, label: 'Settings'  },
]

/**
 * Mobile-only bottom navigation pill.
 * - Uses flex-1 on each item so all 5 share width equally — no overflow.
 * - RootLayout animates this in/out via AnimatePresence.
 * - Purely presentational, no state here.
 */
export default function BottomNav() {
  return (
    <div className={cn(
      // Full available width minus horizontal margin (set by parent)
      'w-full flex items-center',
      'glass-strong rounded-[2rem] shadow-2xl',
      'border border-[var(--border)]',
      'px-1 py-1',
    )}>
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'} className="flex-1 min-w-0">
          {({ isActive }) => (
            <motion.div
              whileTap={{ scale: 0.88 }}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5',
                'py-2.5 rounded-[1.25rem] transition-all duration-300',
                // No horizontal padding — let flex-1 distribute width
                isActive ? 'bg-[var(--accent-subtle)]' : '',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-[var(--accent-subtle)] rounded-[1.25rem]"
                  transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                />
              )}
              <Icon
                className={cn(
                  'relative z-10 w-5 h-5 transition-all duration-300',
                  isActive
                    ? 'text-[var(--accent)] stroke-[2.5]'
                    : 'text-[var(--text-muted)] stroke-2',
                )}
              />
              <span className={cn(
                'relative z-10 text-[10px] font-semibold transition-all duration-300 leading-none',
                isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
              )}>
                {label}
              </span>
            </motion.div>
          )}
        </NavLink>
      ))}
    </div>
  )
}