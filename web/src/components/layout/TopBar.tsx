import { useNavigate } from 'react-router-dom'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'
import NotificationBell from '@/components/New-Components/Icons-and-Buttons/notification-bell'
import { usePersisted } from '@/hooks/persisted.hook'

interface TopBarProps {
  title?: string
  transparent?: boolean
  actions?: React.ReactNode
  className?: string
  showLogo?: boolean
}

export default function TopBar({
  title,
  transparent = false,
  actions,
  className,
  showLogo = false,
}: TopBarProps) {
  const navigate = useNavigate()
  // Master notification switch — shared with Settings → Notifications.
  const [notificationsEnabled, setNotificationsEnabled] = usePersisted(
    'notifications-enabled',
    true
  )

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 sticky top-0 z-20',
        transparent ? 'bg-transparent' : 'glass border-b border-[var(--border)]',
        className
      )}
    >
      {showLogo ? (
        <div className="flex items-center gap-2.5 flex-1">
          <img
            src="/assets/logo.png"
            alt="Rheoson"
            className="w-8 h-8 rounded-xl object-cover shadow-[var(--shadow-glow)]"
          />
          <span className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
            Rheoson
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <IconButton size="sm" variant="glass" onClick={() => navigate(-1)} aria-label="Go back">
              <CaretLeft weight="bold" aria-hidden />
            </IconButton>
            <IconButton size="sm" variant="glass" onClick={() => navigate(1)} aria-label="Go forward">
              <CaretRight weight="bold" aria-hidden />
            </IconButton>
          </div>
          {title ? (
            <h1 className="flex-1 text-base font-semibold text-[var(--text-primary)] truncate">
              {title}
            </h1>
          ) : (
            <div className="flex-1" />
          )}
        </>
      )}
      <div className="flex items-center gap-2 ml-auto">
        {actions}
        <NotificationBell
          enabled={notificationsEnabled}
          onChange={setNotificationsEnabled}
          size={17}
        />
      </div>
    </div>
  )
}
