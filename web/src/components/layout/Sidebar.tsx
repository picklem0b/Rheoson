import { NavLink } from 'react-router-dom'
import { Home, Search, Library, Download, Settings, Heart, Music2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/',         icon: Home,     label: 'Home' },
  { to: '/search',   icon: Search,   label: 'Search' },
  { to: '/library',  icon: Library,  label: 'Library' },
  { to: '/liked',    icon: Heart,    label: 'Liked Songs' },
  { to: '/downloads',icon: Download, label: 'Downloads' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0,   opacity: 1 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="flex flex-col w-[var(--sidebar-width)] h-full bg-[var(--bg-surface)] border-r border-[var(--border)] py-6 px-3 gap-1"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 mb-6">
        <div className="w-9 h-9 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent-subtle)]">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Shulker</span>
      </div>

      {/* Nav */}
      {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          {({ isActive }) => (
            <motion.div
              whileTap={{ scale: 0.97 }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-200',
                isActive
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
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
    </motion.div>
  )
}