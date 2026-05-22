import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}, ref) => {
  const base = 'inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none select-none'

  const variants = {
    primary:   'bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white shadow-lg hover:shadow-[var(--accent-subtle)] hover:shadow-xl',
    secondary: 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] text-[var(--text-primary)] border border-[var(--border)]',
    ghost:     'bg-transparent hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
    danger:    'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30',
    glass:     'glass hover:bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  }

  const sizes = {
    xs: 'h-7  px-3   text-xs  rounded-xl  gap-1.5',
    sm: 'h-9  px-4   text-sm  rounded-2xl gap-2',
    md: 'h-11 px-5   text-sm  rounded-2xl gap-2',
    lg: 'h-13 px-7   text-base rounded-3xl gap-2.5',
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : children}
    </button>
  )
})
Button.displayName = 'Button'