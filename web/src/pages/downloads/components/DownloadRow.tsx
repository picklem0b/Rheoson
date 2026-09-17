import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Loader2, Download, Trash2, RefreshCw, Play, Music2 } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import {
  formatEta,
  formatFileSize,
  formatSpeed,
  truncate,
} from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { DownloadJob, DownloadStatus } from '@/types/download.types'

const STATUS_CONFIG: Record<DownloadStatus, { label: string; color: string; icon: React.ReactNode }> = {
  queued:      { label: 'Queued',      color: 'surface', icon: <Download    className="w-3.5 h-3.5" /> },
  searching:   { label: 'Searching',   color: 'accent',  icon: <Loader2     className="w-3.5 h-3.5 animate-spin" /> },
  downloading: { label: 'Downloading', color: 'accent',  icon: <Loader2     className="w-3.5 h-3.5 animate-spin" /> },
  converting:  { label: 'Converting',  color: 'warning', icon: <Loader2     className="w-3.5 h-3.5 animate-spin" /> },
  tagging:     { label: 'Tagging',     color: 'warning', icon: <Loader2     className="w-3.5 h-3.5 animate-spin" /> },
  done:        { label: 'Done',        color: 'success', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  error:       { label: 'Error',       color: 'danger',  icon: <XCircle     className="w-3.5 h-3.5" /> },
  cancelled:   { label: 'Cancelled',   color: 'surface', icon: <XCircle     className="w-3.5 h-3.5" /> },
}

interface DownloadRowProps {
  job:      DownloadJob
  index:    number
  onCancel: () => void
  onRetry:  () => void
  /** Continue from staged bytes — offered when the backend reports resumable. */
  onResume?: () => void
}

/**
 * Live transfer line for a running download: rate, size and time left.
 *
 * The backend parses these out of yt-dlp's progress output, and they are
 * absent whenever yt-dlp cannot report them (HLS streams, unknown sizes), so
 * every part is optional rather than rendered as a zero.
 */
function transferDetail(job: DownloadJob): string {
  if (job.status !== 'downloading') return ''
  return [
    formatSpeed(job.speedBps ?? 0),
    job.totalBytes ? formatFileSize(job.totalBytes) : '',
    formatEta(job.etaSeconds),
  ]
    .filter(Boolean)
    .join('  ·  ')
}

export default function DownloadRow({ job: jobProp, index, onCancel, onRetry, onResume }: DownloadRowProps) {
  // Schema-drift guards: persisted jobs survive reloads in localStorage, so
  // a job written by an older build can lack fields this row assumes.
  // `job` below is the defaulted object — the whole component reads it.
  const job = {
    ...jobProp,
    title: jobProp.title ?? 'Untitled',
    artist: jobProp.artist ?? 'Unknown Artist',
    status: jobProp.status ?? 'queued',
    progress: typeof jobProp.progress === 'number' ? jobProp.progress : 0,
    format: jobProp.format ?? 'mp3',
    quality: jobProp.quality ?? 0,
  }
  const cfg     = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued
  const active  = !['done', 'error', 'cancelled'].includes(job.status)
  const isError = job.status === 'error'
  const detail  = transferDetail(job)
  const canResume = !active && job.resumable === true && Boolean(onResume)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        'relative overflow-hidden rounded-3xl border transition-all duration-200',
        isError
          ? 'bg-red-500/5 border-red-500/20'
          : 'bg-[var(--bg-surface)] border-[var(--border)]',
      )}
    >
      {/* Progress fill */}
      {active && (
        <motion.div
          className="absolute inset-y-0 left-0 bg-[var(--accent-subtle)] pointer-events-none"
          initial={{ width: 0 }}
          animate={{ width: `${job.progress}%` }}
          transition={{ ease: 'linear', duration: 0.4 }}
        />
      )}

      <div className="relative flex items-center gap-3 px-4 py-3.5">
        {/* Artwork */}
        <div className="relative flex-shrink-0">
          {job.artworkUrl ? (
            <img
              src={job.artworkUrl}
              alt={job.title}
              className="w-12 h-12 rounded-2xl object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center">
              <Music2 className="w-5 h-5 text-[var(--text-muted)]" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {truncate(job.title, 30)}
          </p>
          <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{job.artist}</p>
          {detail && (
            <p className="text-[11px] text-[var(--accent)] mt-0.5 tabular-nums truncate">
              {detail}
            </p>
          )}
          {isError && job.error && (
            <p className="text-xs text-red-400 mt-0.5 truncate">{job.error}</p>
          )}
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {active && (
            <span className="text-xs tabular-nums text-[var(--accent)] font-semibold">
              {job.progress}%
            </span>
          )}
          <Badge variant={cfg.color as 'accent' | 'surface' | 'success' | 'warning' | 'danger'} size="sm">
            {cfg.icon}
            <span className="ml-1">{cfg.label}</span>
          </Badge>
          {canResume ? (
            <IconButton
              size="xs"
              variant="ghost"
              onClick={onResume}
              title={`Resume — ${job.stagedBytes ? formatFileSize(job.stagedBytes) : 'partial data'} already downloaded`}>
              <Play />
            </IconButton>
          ) : isError && (
            <IconButton size="xs" variant="ghost" onClick={onRetry} title="Retry">
              <RefreshCw />
            </IconButton>
          )}
          {active && (
            <IconButton size="xs" variant="ghost" onClick={onCancel} title="Cancel">
              <XCircle />
            </IconButton>
          )}
          {job.status === 'done' && (
            <IconButton size="xs" variant="ghost" onClick={onCancel} title="Remove">
              <Trash2 />
            </IconButton>
          )}
        </div>
      </div>

      {/* Format badge */}
      <div className="absolute bottom-3 right-4">
        <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] tracking-wider">
          {job.format} · {job.quality}k
        </span>
      </div>
    </motion.div>
  )
}
