import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  ghost: 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

/**
 * The primitive every clickable surface starts from.
 *
 * It reads semantic tokens only, so an accent change is a token change and never
 * a component change.
 */
export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
        'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
