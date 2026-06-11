import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── SettingsGroup ─────────────────────────────────────────────

export function SettingsGroup({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5', className)}>
      {title && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">
          {title}
        </p>
      )}
      <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
        {children}
      </div>
    </div>
  )
}

// ── SettingsRow ───────────────────────────────────────────────

export function SettingsRow({
  label,
  description,
  value,
  onClick,
  children,
  danger,
}: {
  label: string
  description?: string
  value?: string
  onClick?: () => void
  children?: React.ReactNode
  danger?: boolean
}) {
  const Tag = onClick ? motion.button : ('div' as any)
  return (
    <Tag
      whileHover={onClick ? { backgroundColor: 'var(--bg-elevated)' } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      onClick={onClick}
      className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', danger ? 'text-red-400' : 'text-[var(--text-primary)]')}>
          {label}
        </p>
        {description && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {children ?? (
          <>
            {value && <span className="text-xs text-[var(--text-muted)] font-medium">{value}</span>}
            {onClick && <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
          </>
        )}
      </div>
    </Tag>
  )
}

// ── Toggle ────────────────────────────────────────────────────

export function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <motion.button
      onClick={() => onChange(!value)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors duration-300 flex-shrink-0',
        value ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]',
      )}
    >
      <motion.div
        animate={{ x: value ? 20 : 2 }}
        transition={{ type: 'spring', damping: 20, stiffness: 350 }}
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
      />
    </motion.button>
  )
}

// ── RadioGroup ────────────────────────────────────────────────

export function RadioGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; sub?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <>
      {options.map((o) => (
        <SettingsRow key={o.value} label={o.label} description={o.sub} onClick={() => onChange(o.value)}>
          <div
            className={cn(
              'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
              value === o.value
                ? 'border-[var(--accent)] bg-[var(--accent)]'
                : 'border-[var(--border-strong)]',
            )}
          >
            {value === o.value && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        </SettingsRow>
      ))}
    </>
  )
}
