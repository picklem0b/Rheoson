import { NavLink } from 'react-router-dom'
import { Home, Search, Library, Download, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/',         icon: Home,     label: 'Home' },
  { to: '/search',   icon: Search,   label: 'Search' },
  { to: '/library',  icon: Library,  label: 'Library' },
  { to: '/downloads',icon: Download, label: 'Downloads' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function BottomNav() {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0,   opacity: 1 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300, delay: 0.1 }}
      className={cn(
        'flex items-center gap-1 px-3 py-2.5',
        'glass-strong rounded-[2rem] shadow-2xl',
        'border border-[var(--border)]',
      )}
    >
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          {({ isActive }) => (
            <motion.div
              whileTap={{ scale: 0.88 }}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5',
                'px-4 py-2 rounded-[1.5rem] transition-all duration-300',
                isActive
                  ? 'bg-[var(--accent-subtle)]'
                  : 'hover:bg-[var(--bg-elevated)]',
              )}
            >
              {/* Active pill indicator */}
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-[var(--accent-subtle)] rounded-[1.5rem]"
                  transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                />
              )}

              <Icon
                className={cn(
                  'relative z-10 w-5 h-5 transition-all duration-300',
                  isActive
                    ? 'text-[var(--accent)] stroke-[2.5]'
                    : 'text-[var(--text-muted)] stroke-2'
                )}
              />

              <span className={cn(
                'relative z-10 text-[10px] font-semibold transition-all duration-300',
                isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              )}>
                {label}
              </span>
            </motion.div>
          )}
        </NavLink>
      ))}
    </motion.div>
  )
}