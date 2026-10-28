import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CaretRight } from '@phosphor-icons/react'
import { useAuthStore } from '@/store/auth.store'
import UserAvatar from '@/components/ui/UserAvatar'
import { useIsGuest } from '@/hooks/useIsGuest'
import { requestAuth } from '@/lib/authGate'
import { UserCircle } from '@phosphor-icons/react'

/**
 * Profile summary card — shown pinned above the Settings groups.
 * Opens the Profile page, or the sign-in card for guests.
 */
export function ProfileRow({ onNavigate }: { onNavigate?: () => void } = {}) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const guest = useIsGuest()

  const handle = user?.username ?? user?.email?.split('@')[0] ?? 'you'
  const name = guest ? 'Guest' : `@${handle}`

  const open = () => {
    onNavigate?.()
    // Guests get the sign-in card, not a page.
    if (guest) void requestAuth('Sign in to see your profile')
    else navigate('/profile')
  }

  return (
    <motion.button
      whileTap={{ scale: 0.98, opacity: 0.8 }}
      onClick={open}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[18px] text-left
                 bg-[var(--bg-surface)] border border-[var(--border)]/30
                 hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]/60
                 transition-colors duration-150 group"
    >
      {/* Non-interactive on purpose: the whole row navigates, so the avatar
          must not also open Clerk's account popover on top of it. */}
      {guest ? (
        <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
          <UserCircle className="w-6 h-6 text-[var(--text-muted)]" />
        </div>
      ) : (
        <UserAvatar size="md" shape="rounded" interactive={false} name={handle} />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-[var(--text-primary)] truncate leading-snug">
          {name}
        </p>
        <p className="text-[12px] text-[var(--text-muted)] truncate leading-snug mt-[2px]">
          {guest ? 'Sign in or create an account' : (user?.email ?? 'View profile')}
        </p>
      </div>

      <div className="w-7 h-7 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]
                      flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--bg-overlay)] transition-colors">
        <CaretRight className="w-4 h-4 text-[var(--text-secondary)]" />
      </div>
    </motion.button>
  )
}
