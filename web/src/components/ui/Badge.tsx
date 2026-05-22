import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'accent' | 'surface' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({ children, variant = 'surface', size = 'md', className }: BadgeProps) {
  const variants = {
    accent:  'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)]',
    surface: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]',
    success: 'bg-green-500/10 text-green-400 border border-green-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    danger:  'bg-red-500/10 text-red-400 border border-red-500/20',
  }
  const sizes = {
    sm: 'text-2xs px-2 py-0.5 rounded-lg',
    md: 'text-xs  px-2.5 py-1 rounded-xl',
  }
  return (
    <span className={cn('inline-flex items-center font-medium', variants[variant], sizes[size], className)}>
      {children}
    </span>
  )
}