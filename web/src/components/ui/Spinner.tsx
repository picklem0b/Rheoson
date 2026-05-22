import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  accent?: boolean
}

export function Spinner({ size = 'md', className, accent = false }: SpinnerProps) {
  const sizes = {
    xs: 'w-3 h-3 border',
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-[3px]',
  }
  return (
    <div
      className={cn(
        'rounded-full animate-spin border-t-transparent',
        sizes[size],
        accent ? 'border-[var(--accent)]' : 'border-[var(--text-secondary)]',
        className
      )}
    />
  )
}