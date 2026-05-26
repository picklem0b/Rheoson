import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?:       string
  transparent?: boolean
  actions?:     React.ReactNode
  className?:   string
  showLogo?:    boolean  // Home page — shows "Shulker" + logo, no back/forward
}

export default function TopBar({
  title,
  transparent = false,
  actions,
  className,
  showLogo = false,
}: TopBarProps) {
  const navigate = useNavigate()

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 sticky top-0 z-20',
      transparent ? 'bg-transparent' : 'glass border-b border-[var(--border)]',
      className,
    )}>

      {showLogo ? (
        // ── Home page header — logo + wordmark ──────────────
        <div className="flex items-center gap-2.5 flex-1">
          <img
            src="/assets/logo.png"
            alt="Shulker"
            className="w-8 h-8 rounded-xl object-cover"
            style={{ boxShadow: '0 0 8px var(--accent-subtle)' }}
          />
          <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
            Shulker
          </span>
        </div>
      ) : (
        // ── Inner page header — back/forward + title ─────────
        <>
          <div className="flex items-center gap-1">
            <IconButton size="sm" variant="glass" onClick={() => navigate(-1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton size="sm" variant="glass" onClick={() => navigate(1)}>
              <ChevronRight />
            </IconButton>
          </div>

          {title && (
            <h1 className="flex-1 text-base font-bold text-[var(--text-primary)] truncate">
              {title}
            </h1>
          )}

          {!title && <div className="flex-1" />}
        </>
      )}

      {actions && (
        <div className="flex items-center gap-2 ml-auto">
          {actions}
        </div>
      )}
    </div>
  )
}