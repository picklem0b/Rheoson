import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ScrollAreaProps {
  children: React.ReactNode
  className?: string
  horizontal?: boolean
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(({
  children,
  className,
  horizontal = false,
}, ref) => (
  <div
    ref={ref}
    className={cn(
      'overflow-auto no-scrollbar',
      horizontal ? 'overflow-y-hidden overflow-x-auto' : 'overflow-x-hidden overflow-y-auto',
      className
    )}
  >
    {children}
  </div>
))
ScrollArea.displayName = 'ScrollArea'