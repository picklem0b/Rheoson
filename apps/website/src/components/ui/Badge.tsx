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
    success: 'bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success)]/20',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning)]/20',
    danger:  'bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger)]/20',
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