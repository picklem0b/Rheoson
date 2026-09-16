import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface NotificationBellProps {
  /** Controlled state. Omit to let the bell manage its own. */
  enabled?: boolean
  defaultEnabled?: boolean
  onChange?: (enabled: boolean) => void
  label?: string
  /** Icon edge length in pixels. */
  size?: number
  className?: string
}

const BellOutline = ({ size }: { size: number }) => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    height={size}
    width={size}
    viewBox='0 0 448 512'
    fill='currentColor'
    aria-hidden
  >
    <path d='M224 0c-17.7 0-32 14.3-32 32V49.9C119.5 61.4 64 124.2 64 200v33.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416H424c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6C399.5 322.9 384 278.8 384 233.4V200c0-75.8-55.5-138.6-128-150.1V32c0-17.7-14.3-32-32-32zm0 96h8c57.4 0 104 46.6 104 104v33.4c0 47.9 13.9 94.6 39.7 134.6H72.3C98.1 328 112 281.3 112 233.4V200c0-57.4 46.6-104 104-104h8zm64 352H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7s18.7-28.3 18.7-45.3z' />
  </svg>
)

const BellSolid = ({ size }: { size: number }) => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    height={size}
    width={size}
    viewBox='0 0 448 512'
    fill='currentColor'
    aria-hidden
  >
    <path d='M224 0c-17.7 0-32 14.3-32 32V51.2C119 66 64 130.6 64 208v18.8c0 47-17.3 92.4-48.5 127.6l-7.4 8.3c-8.4 9.4-10.4 22.9-5.3 34.4S19.4 416 32 416H416c12.6 0 24-7.4 29.2-18.9s3.1-25-5.3-34.4l-7.4-8.3C401.3 319.2 384 273.9 384 226.8V208c0-77.4-55-142-128-156.8V32c0-17.7-14.3-32-32-32zm45.3 493.3c12-12 18.7-28.3 18.7-45.3H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7z' />
  </svg>
)

/**
 * Bell toggle for notification preferences.
 *
 * Filled bell when notifications are on, outline bell when off, with the
 * imported keyboard-accessible swipe/wiggle animation replaced by a Tailwind
 * transition so it composes with the rest of the UI kit.
 */
export function NotificationBell({
  enabled,
  defaultEnabled = true,
  onChange,
  label = 'Notifications',
  size = 18,
  className,
}: NotificationBellProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultEnabled)
  const isOn = enabled ?? uncontrolled

  const toggle = () => {
    const next = !isOn
    if (enabled === undefined) setUncontrolled(next)
    onChange?.(next)
  }

  return (
    <button
      type='button'
      role='switch'
      aria-checked={isOn}
      aria-label={`${label}: ${isOn ? 'on' : 'off'}`}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-full',
        'transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        isOn
          ? 'text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
        className
      )}
    >
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center',
          'transition-all duration-300 ease-ios',
          isOn
            ? 'scale-100 rotate-0 opacity-100'
            : 'scale-90 -rotate-12 opacity-0'
        )}
      >
        <BellSolid size={size} />
      </span>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center',
          'transition-all duration-300 ease-ios',
          isOn
            ? 'scale-90 rotate-12 opacity-0'
            : 'scale-100 rotate-0 opacity-100'
        )}
      >
        <BellOutline size={size} />
      </span>

      {/* Unread dot — only meaningful once notifications are on */}
      {isOn && (
        <span className='absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]' />
      )}
    </button>
  )
}

export default NotificationBell
