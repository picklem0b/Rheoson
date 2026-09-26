import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, Info, Warning, X, CaretDown } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { splitErrorCode } from '@/api/client.api'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastData {
  id: string
  type: ToastType
  message: string
  duration?: number
  /** DCCNN registry code from the backend (e.g. "DEX01"). */
  code?: string
  /**
   * The full, untruncated message. When present the toast renders an ⓘ
   * control that reveals it — the one-line `message` stays scannable while
   * the detail (and its [ERR …] code, when `fullDetail` carries it) is
   * always reachable. Also reused as the tooltip title for hover.
   */
  fullDetail?: string
}

interface ToastProps extends ToastData {
  onDismiss: (id: string) => void
}

const icons = {
  success: <CheckCircle className="w-4 h-4 text-[var(--success-text)]" />,
  error:   <XCircle     className="w-4 h-4 text-[var(--danger-text)]" />,
  info:    <Info        className="w-4 h-4 text-blue-400" />,
  warning: <Warning className="w-4 h-4 text-[var(--warning-text)]" />,
}

const styles = {
  success: 'border-[var(--success)]/20',
  error:   'border-[var(--danger)]/20',
  info:    'border-blue-500/20',
  warning: 'border-[var(--warning)]/20',
}

export function Toast({ id, type, message, code, fullDetail, onDismiss }: ToastProps) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const detail = fullDetail ?? message
  const hasMore = detail !== message || !!code
  // fullDetail often still carries the trailing "[ERR …]" suffix the backend
  // appends; the chip below renders it, so strip it there rather than show
  // the same code twice.
  const detailText = fullDetail ? splitErrorCode(fullDetail).message : message

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{   opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        'flex flex-col gap-1 px-4 py-3 rounded-2xl shadow-xl border',
        'glass-strong min-w-[280px] max-w-sm',
        styles[type]
      )}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-center gap-3">
        {icons[type]}
        <p className="flex-1 text-sm font-medium text-[var(--text-primary)]">{message}</p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? 'Hide error details' : 'Show error details'}
            title={detailText}
            className="shrink-0 rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] transition-colors"
          >
            <Info className="w-4 h-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
          className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-1 pt-2 border-t border-[var(--border)]/40 flex items-start gap-2">
              <CaretDown className="w-3 h-3 mt-1 rotate-180 text-[var(--text-muted)]" aria-hidden />
              <p className="text-xs leading-relaxed text-[var(--text-muted)] break-words">
                {detailText}
                {code && <span className="ml-1 font-mono font-semibold text-[var(--text-primary)]">[ERR {code}]</span>}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {code && !expanded && (
        <span className="sr-only">Error code {code}</span>
      )}
    </motion.div>
  )
}
