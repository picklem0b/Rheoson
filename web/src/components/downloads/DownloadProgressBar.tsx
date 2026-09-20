import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DownloadSimple, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { useDownloadStore, selectActiveJobs } from '@/store/download.store'
import { cn } from '@/lib/utils'

/**
 * Global download progress pill.
 *
 * Sits above the player bar whenever at least one download is running, so
 * progress is always visible no matter which page the user is on — not just
 * inside the Downloads tab or the one-shot modal. Tapping it opens the
 * Downloads page. Renders nothing when idle (a brief success state is shown
 * when the last job completes so the completion doesn't feel silent).
 */
export function DownloadProgressBar() {
  const navigate = useNavigate()
  const activeJobs = useDownloadStore(selectActiveJobs)
  const lastCompleted = useDownloadStore(
    (s) => s.jobs.find((j) => j.status === 'done') ?? null
  )
  const lastError = useDownloadStore(
    (s) => s.jobs.find((j) => j.status === 'error') ?? null
  )

  const count = activeJobs.length
  const headline = activeJobs[0]
  const progress =
    count > 0
      ? Math.round(activeJobs.reduce((sum, j) => sum + (j.progress ?? 0), 0) / count)
      : 0

  return (
    <AnimatePresence>
      {count > 0 && headline && (
        <motion.button
          key="active"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          onClick={() => navigate('/downloads')}
          className={cn(
            'fixed z-[140] flex items-center gap-3 w-[calc(100%-2rem)] max-w-sm px-4 py-2.5',
            'rounded-2xl border bg-[var(--bg-elevated)] border-[var(--border)] shadow-lg',
            'bottom-[calc(var(--player-height,72px)+10px)] left-1/2 -translate-x-1/2',
            'sm:left-auto sm:right-5 sm:translate-x-0 text-left'
          )}
        >
          <DownloadSimple className="w-4 h-4 text-[var(--accent)] flex-shrink-0 animate-bounce" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {count === 1
                  ? headline.title
                  : `Downloading ${count} tracks`}
              </p>
              <span className="text-[10px] font-bold text-[var(--text-muted)] tabular-nums">
                {progress}%
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </motion.button>
      )}

      {count === 0 && lastCompleted && (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => {
            // Brief confirmation only — clear the store's done entry so the
            // pill disappears after a moment instead of sticking around.
            setTimeout(() => useDownloadStore.getState().clearDone(), 2500)
          }}
          className={cn(
            'fixed z-[140] flex items-center gap-2 px-3.5 py-2 rounded-full',
            'bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg',
            'bottom-[calc(var(--player-height,72px)+10px)] left-1/2 -translate-x-1/2',
            'sm:left-auto sm:right-5 sm:translate-x-0'
          )}
        >
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[220px]">
            {lastCompleted.title} downloaded
          </span>
        </motion.div>
      )}

      {count === 0 && !lastCompleted && lastError && (
        <motion.div
          key="error"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={cn(
            'fixed z-[140] flex items-center gap-2 px-3.5 py-2 rounded-full',
            'bg-red-500/10 border border-red-500/20',
            'bottom-[calc(var(--player-height,72px)+10px)] left-1/2 -translate-x-1/2',
            'sm:left-auto sm:right-5 sm:translate-x-0'
          )}
        >
          <WarningCircle className="w-4 h-4 text-red-400" />
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[240px]">
            {lastError.title} failed — {lastError.error || 'tap to retry in Downloads'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default DownloadProgressBar
