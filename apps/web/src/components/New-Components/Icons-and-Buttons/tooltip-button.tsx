import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TooltipButtonProps {
  children: ReactNode
  /** Tooltip heading. The tooltip is hidden entirely when omitted. */
  title?: string
  description?: string
  /** Small caption under the description, e.g. "Premium Feature". */
  badge?: ReactNode
  side?: 'top' | 'bottom'
  onClick?: () => void
  disabled?: boolean
  className?: string
  tooltipClassName?: string
}

/**
 * Primary action button with a rich hover/focus tooltip.
 *
 * Hover-only tooltips are unreachable on touch and for keyboard users, so this
 * one also opens on focus and closes on blur — it behaves like the tooltip in
 * the design source, but is actually operable.
 */
export const TooltipButton = forwardRef<HTMLButtonElement, TooltipButtonProps>(
  (
    {
      children,
      title,
      description,
      badge,
      side = 'top',
      onClick,
      disabled,
      className,
      tooltipClassName,
    },
    ref
  ) => {
    const hasTooltip = Boolean(title || description)

    return (
      <div className='group relative inline-block'>
        <button
          ref={ref}
          type='button'
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold text-white',
            'bg-[var(--accent)] transition-all duration-300',
            'hover:brightness-110 focus:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
            'focus-visible:ring-offset-[var(--bg-base)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          {/* Soft glow behind the label */}
          <span className='pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-80' />
          <span className='relative flex items-center justify-center gap-2'>
            {children}
          </span>
        </button>

        {hasTooltip && (
          <div
            role='tooltip'
            className={cn(
              'pointer-events-none absolute left-1/2 z-50 w-64 -translate-x-1/2',
              'invisible opacity-0 transition-all duration-300 ease-out',
              'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
              side === 'top'
                ? 'bottom-full mb-3 translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0'
                : 'top-full mt-3 -translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0',
              tooltipClassName
            )}
          >
            <div className='relative rounded-2xl border border-white/10 bg-[var(--bg-surface)]/95 p-3.5 shadow-2xl backdrop-blur-md'>
              {title && (
                <h3 className='text-sm font-semibold text-[var(--text-primary)]'>
                  {title}
                </h3>
              )}
              {description && (
                <p className='mt-1 text-xs leading-relaxed text-[var(--text-secondary)]'>
                  {description}
                </p>
              )}
              {badge && (
                <div className='mt-2 flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-[var(--accent)] uppercase'>
                  {badge}
                </div>
              )}

              {/* Arrow */}
              <div
                className={cn(
                  'absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-white/10 bg-[var(--bg-surface)]',
                  side === 'top'
                    ? '-bottom-1.5 border-r border-b'
                    : '-top-1.5 border-t border-l'
                )}
              />
            </div>
          </div>
        )}
      </div>
    )
  }
)

TooltipButton.displayName = 'TooltipButton'

export default TooltipButton
