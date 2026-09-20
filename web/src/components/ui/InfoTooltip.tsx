import { useEffect, useId, useRef, useState } from 'react'
import { Info } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * A small "what does this mean?" affordance.
 *
 * Explanatory text used to sit under headings as a permanent subtitle, which
 * pushed implementation detail — refresh cadence, caching — in front of every
 * user whether or not they cared. Tucking the same sentence behind an info icon
 * keeps the explanation available without spending the interface's attention on
 * it.
 *
 * Opens on click (not hover) so it works on touch, closes on Escape, an
 * outside click, or a second tap. It is a disclosure rather than a hover
 * tooltip — the trigger carries `aria-expanded` and points at the panel with
 * `aria-controls`, which is what a screen reader expects for content that only
 * appears on request. A `role="tooltip"` would be wrong here: tooltips are
 * announced on hover/focus, not on activation.
 */
export function InfoTooltip({
   label,
   children,
   side = 'bottom',
   className,
}: {
   /** Accessible name for the trigger, e.g. "About weekly charts". */
   label: string
   children: React.ReactNode
   side?: 'top' | 'bottom'
   className?: string
}) {
   const [open, setOpen] = useState(false)
   const rootRef = useRef<HTMLSpanElement>(null)
   const panelId = useId()

   useEffect(() => {
      if (!open) return
      const onPointerDown = (event: PointerEvent) => {
         if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
      }
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') setOpen(false)
      }
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      return () => {
         document.removeEventListener('pointerdown', onPointerDown)
         document.removeEventListener('keydown', onKeyDown)
      }
   }, [open])

   return (
      <span ref={rootRef} className={cn('relative inline-flex align-middle', className)}>
         <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={label}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            className={cn(
               'flex h-6 w-6 items-center justify-center rounded-full',
               'text-[var(--text-muted)] transition-colors',
               'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
               'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
               open && 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            )}
         >
            <Info className="h-3.5 w-3.5" />
         </button>

         {open && (
            <span
               id={panelId}
               className={cn(
                  'absolute left-1/2 z-50 w-60 -translate-x-1/2 rounded-xl border px-3 py-2',
                  'bg-[var(--bg-elevated)] border-[var(--border)] shadow-lg',
                  'text-[12px] leading-snug text-[var(--text-secondary)]',
                  side === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'
               )}
            >
               {children}
            </span>
         )}
      </span>
   )
}

export default InfoTooltip
