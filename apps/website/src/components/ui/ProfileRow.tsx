import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CaretRight } from '@phosphor-icons/react'
import { useAuthStore } from '@/store/auth.store'
import UserAvatar from '@/components/ui/UserAvatar'

/**
 * Profile summary card — shown pinned above the GearSix groups.
 * Opens the Profile page. AuthGuard guarantees a signed-in user here.
 */
export function ProfileRow() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const name = user?.username ?? 'Your account'

  return (
    <motion.button
      whileTap={{ scale: 0.98, opacity: 0.8 }}
      onClick={() => navigate('/profile')}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[18px] text-left
                 bg-[var(--bg-surface)] border border-[var(--border)]/30
                 hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]/60
                 transition-colors duration-150 group"
    >
      {/* Non-interactive on purpose: the whole row navigates, so the avatar
          must not also open Clerk's account popover on top of it. */}
      <UserAvatar size="md" shape="rounded" interactive={false} />

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-[var(--text-primary)] truncate leading-snug">
          {name}
        </p>
        <p className="text-[12px] text-[var(--text-muted)] truncate leading-snug mt-[2px]">
          {user?.email ?? 'View profile'}
        </p>
      </div>

      <div className="w-7 h-7 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]
                      flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--bg-overlay)] transition-colors">
        <CaretRight className="w-4 h-4 text-[var(--text-secondary)]" />
      </div>
    </motion.button>
  )
}
