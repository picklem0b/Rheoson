import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  transparent?: boolean
  actions?: React.ReactNode
  className?: string
}

export default function TopBar({ title, transparent = false, actions, className }: TopBarProps) {
  const navigate = useNavigate()

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 sticky top-0 z-20',
      transparent
        ? 'bg-transparent'
        : 'glass border-b border-[var(--border)]',
      className
    )}>
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

      {actions && (
        <div className="flex items-center gap-2 ml-auto">
          {actions}
        </div>
      )}
    </div>
  )
}