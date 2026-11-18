import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'glass' | 'filled' | 'accent'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  children,
  ...props
}, ref) => {
  const base = 'inline-flex items-center justify-center transition-all duration-200 active:scale-90 disabled:opacity-40 disabled:pointer-events-none select-none flex-shrink-0'

  const variants = {
    ghost:  'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-2xl',
    glass:  'glass text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] rounded-2xl',
    filled: 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] text-[var(--text-primary)] border border-[var(--border)] rounded-2xl',
    accent: 'bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white shadow-lg rounded-2xl',
  }

  const sizes = {
    xs: 'w-7  h-7  [&>svg]:w-3.5 [&>svg]:h-3.5',
    sm: 'w-9  h-9  [&>svg]:w-4   [&>svg]:h-4',
    md: 'w-10 h-10 [&>svg]:w-5   [&>svg]:h-5',
    lg: 'w-12 h-12 [&>svg]:w-6   [&>svg]:h-6',
    xl: 'w-14 h-14 [&>svg]:w-7   [&>svg]:h-7',
  }

  return (
    <button
      ref={ref}
      className={cn(
        base,
        variants[variant],
        sizes[size],
        active && 'text-[var(--accent)] bg-[var(--accent-subtle)]',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})
IconButton.displayName = 'IconButton'