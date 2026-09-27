import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GearSix,
  ChartLineUp,
  Info,
  Shield,
  UserCircle,
  CaretRight,
  X,
} from '@phosphor-icons/react'
import { ProfileRow } from '@/components/ui/ProfileRow'

/**
 * ProfileSheet — the card that opens from the nav bar's profile picture.
 *
 * Replaces the old gear-icon entry: your face is the way into everything
 * personal. Settings and Listening stats are full pages; About, Privacy
 * and Account land directly on their settings sections via ?section=
 * (and the settings-section event, so an already-open Settings page
 * follows along).
 */
export default function ProfileSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()

  const go = (to: string, section?: string) => {
    if (section) {
      window.dispatchEvent(
        new CustomEvent('rheoson:settings-section', { detail: section }),
      )
    }
    navigate(section ? `/settings?section=${section}` : to)
    onClose()
  }

  const items = [
    { icon: GearSix, label: 'Settings', desc: 'Everything configurable', go: () => go('/settings') },
    { icon: ChartLineUp, label: 'Listening stats', desc: 'Top songs, artists and hours', go: () => go('/stats') },
    { icon: Info, label: 'About', desc: 'Version, changelog, community', go: () => go('/settings', 'about') },
    { icon: Shield, label: 'Privacy', desc: 'History, backups, your data', go: () => go('/settings', 'privacy') },
    { icon: UserCircle, label: 'Account', desc: 'Profile and credentials', go: () => go('/settings', 'account') },
  ]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[71] p-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:w-[360px] sm:p-0"
        role="dialog"
        aria-label="Profile menu"
      >
        <div className="glass-strong rounded-3xl border border-[var(--border)] overflow-hidden shadow-2xl">
          {/* Header — your identity */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <ProfileRow />
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Entries */}
          <div className="p-2 pb-3">
            {items.map(item => (
              <motion.button
                key={item.label}
                whileTap={{ scale: 0.98 }}
                onClick={item.go}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-[var(--bg-elevated)] transition-colors">
                <span className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4.5 h-4.5 text-[var(--accent)]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">
                    {item.label}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)] truncate">
                    {item.desc}
                  </span>
                </span>
                <CaretRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
