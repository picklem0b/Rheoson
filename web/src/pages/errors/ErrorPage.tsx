import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Info, ArrowLeft, House, ArrowClockwise, X } from '@phosphor-icons/react'
import {
  errorPageFor,
  type ErrorPageConfig,
} from '@/lib/errorPages'
import { cn } from '@/lib/utils'

/**
 * ErrorPage — the one visual treatment for every error state.
 *
 * Minimal by design: an "ERROR PAGE" eyebrow, the big code, the short label,
 * and an ⓘ control. The longer explanation lives behind the ⓘ — a modal with
 * the error-specific title and subtitle — so the page stays calm while the
 * detail stays one tap away. Works with mouse, keyboard and touch; the info
 * control is a real <button> with aria-expanded/aria-controls and focus
 * returns to it when the panel closes.
 *
 * `status` accepts any number; unknown values fall back to the 500-shaped
 * generic entry via errorPageFor(). `message` (a raw detail string, e.g. from
 * an API error) is shown in the panel when provided.
 *
 * Purely presentational — no router hooks — so it renders identically inside
 * routes (router.tsx), under API-failure redirects (ErrorRedirect) and above
 * the router entirely (ErrorBoundary). Callers supply `actions`; the router
 * defaults live in ErrorPageNavActions, exported below.
 */
export default function ErrorPage({
  status,
  message,
  onRetry,
  actions,
}: {
  status: number
  /** Raw detail from an API failure, if one exists. */
  message?: string
  /** Optional retry action — rendered as the primary button in the panel. */
  onRetry?: () => void
  /** Callers supply the action row (Go back / Home, Reload app, …). */
  actions?: React.ReactNode
}) {
  const config: ErrorPageConfig = errorPageFor(status)
  const [showInfo, setShowInfo] = useState(false)
  const infoRef = useRef<HTMLButtonElement>(null)

  // Escape closes the panel; focus returns to the ⓘ that opened it.
  useEffect(() => {
    if (!showInfo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowInfo(false)
        infoRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showInfo])

  const closeInfo = () => {
    setShowInfo(false)
    infoRef.current?.focus()
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full px-8 text-center gap-6 select-none"
      data-error-status={config.status}
    >
      {/* Eyebrow */}
      <motion.p
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-[11px] font-bold tracking-[0.35em] text-[var(--text-muted)] uppercase"
      >
        Error page
      </motion.p>

      {/* Big code + label + ⓘ */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 18 }}
        className="flex flex-col items-center gap-1"
      >
        <div className="flex items-center gap-3">
          <span className="text-7xl font-black tracking-tight text-[var(--text-primary)] tabular-nums">
            {config.status}
          </span>
          <button
            ref={infoRef}
            type="button"
            onClick={() => setShowInfo(v => !v)}
            aria-expanded={showInfo}
            aria-controls="error-page-info"
            aria-label={`About error ${config.status} — ${config.label}`}
            className="rounded-full p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]
                       hover:bg-[var(--bg-hover)] active:scale-95 transition-all
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <Info className="w-6 h-6" aria-hidden />
          </button>
        </div>
        <span className="text-xs font-bold tracking-[0.3em] text-[var(--accent)] uppercase">
          {config.label}
        </span>
      </motion.div>

      {/* Info panel — modal on desktop, bottom sheet on mobile */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            id="error-page-info"
            role="dialog"
            aria-modal="true"
            aria-label={`Error ${config.status} details`}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="fixed inset-x-4 bottom-4 sm:inset-auto sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2
                       sm:left-1/2 sm:-translate-x-1/2 z-50 w-auto sm:w-[min(420px,90vw)]
                       glass-strong rounded-3xl shadow-2xl border border-[var(--border)] p-6 text-left"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{config.title}</h2>
              <button
                type="button"
                onClick={closeInfo}
                aria-label="Close details"
                className="rounded-full p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]
                           hover:bg-[var(--bg-hover)] transition-colors
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              {config.subtitle}
            </p>
            {message && message !== config.subtitle && (
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)] break-words
                            border-t border-[var(--border)]/40 pt-3">
                {message}
              </p>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={() => { closeInfo(); onRetry() }}
                className="mt-4 w-full px-4 py-2.5 rounded-2xl bg-[var(--accent)] text-sm
                           font-bold text-white shadow-lg active:scale-[0.98] transition-transform
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]
                           flex items-center justify-center gap-2"
              >
                <ArrowClockwise className="w-4 h-4" aria-hidden />
                Try again
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions — always caller-provided; the wrappers below own the defaults */}
      {actions}
    </div>
  )
}

// ── Router-aware action row ──────────────────────────────────
// Kept out of ErrorPage itself so the component stays legal above the
// router (ErrorBoundary mounts it without any Router context). Routed
// wrappers (NotFound, ErrorRedirect) render this as their actions row.

export function ErrorPageNavActions() {
  const navigate = useNavigate()
  return (
    <div className="flex gap-3">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--bg-elevated)]
                   text-sm font-semibold text-[var(--text-primary)] border border-[var(--border)]
                   active:bg-[var(--bg-surface)] transition-colors
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Go back
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/')}
        className={cn(
          'flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--accent)]',
          'text-sm font-bold text-white shadow-lg',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
        )}
      >
        <House className="w-4 h-4" aria-hidden />
        Home
      </motion.button>
    </div>
  )
}
