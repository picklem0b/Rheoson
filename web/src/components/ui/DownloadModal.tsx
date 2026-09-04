import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Download, WifiOff } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Skeleton } from './Skeleton'
import { ArtworkImage } from './ArtworkImage'
import { useToast } from './Toaster'
import { useDownloads } from '@/hooks/downloads.hook'
import { tracksApi } from '@/api/tracks.api'
import { useUIStore } from '@/store/ui.store'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/formatters'
import type { AudioFormat, AudioQuality } from '@/types'

// ── Options ────────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: AudioFormat; label: string; lossless: boolean }[] = [
  { value: 'mp3',  label: 'MP3',  lossless: false },
  { value: 'opus', label: 'Opus', lossless: false },
  { value: 'm4a',  label: 'M4A',  lossless: false },
  { value: 'flac', label: 'FLAC', lossless: true },
  { value: 'wav',  label: 'WAV',  lossless: true },
]

const QUALITY_OPTIONS: AudioQuality[] = ['128', '192', '256', '320', 'best']

// Read a preference persisted by the Settings → Downloads section.
// Keys are stored as JSON under a "rheoson-" prefix (see persisted.hook).
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`rheoson-${key}`)
    return raw !== null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// ── Small switch ───────────────────────────────────────────────

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'w-10 h-6 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0',
        on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)] border border-[var(--border)]'
      )}
    >
      <motion.div
        layout
        transition={{ type: 'spring', damping: 28, stiffness: 400 }}
        className={cn(
          'w-5 h-5 rounded-full shadow-md',
          on ? 'bg-white ml-auto' : 'bg-[var(--text-muted)]'
        )}
      />
    </button>
  )
}

// ── Modal ──────────────────────────────────────────────────────

/**
 * Download options modal — opened from the PlayerBar menu, Now Playing,
 * and search results via uiStore.openDownloadModal(trackId).
 *
 * Lets the user pick format/quality (defaults come from Settings →
 * Downloads) and queues the job through the same optimistic download
 * store used by the rest of the app.
 */
export function DownloadModal() {
  const trackId = useUIStore((s) => s.downloadModalTrackId)
  const closeDownloadModal = useUIStore((s) => s.closeDownloadModal)
  const { download } = useDownloads()
  const { toast } = useToast()

  // One-off choices — start from the user's saved defaults but never
  // write back to them (a download is a single action, not a preference).
  const [format, setFormat] = useState<AudioFormat>(() => {
    const saved = readPref<AudioFormat>('dl-format', 'mp3')
    return FORMAT_OPTIONS.some((f) => f.value === saved) ? saved : 'mp3'
  })
  const [quality, setQuality] = useState<AudioQuality>(() => {
    const saved = readPref<AudioQuality>('dl-quality', '320')
    return QUALITY_OPTIONS.includes(saved) ? saved : '320'
  })
  const [embedArtwork, setEmbedArtwork] = useState(() => readPref('dl-artwork', true))
  const [embedLyrics, setEmbedLyrics] = useState(() => readPref('dl-lyrics', true))

  const selected = FORMAT_OPTIONS.find((f) => f.value === format)
  const lossless = selected?.lossless ?? false
  const effectiveQuality: AudioQuality = lossless ? 'best' : quality

  const { data: track, isLoading, isError, refetch } = useQuery({
    queryKey: ['track', 'download', trackId],
    queryFn: () => tracksApi.getTrack(trackId!),
    enabled: !!trackId,
    retry: 1,
  })

  const handleDownload = async () => {
    if (!track) return
    try {
      await download(track, {
        format,
        quality: effectiveQuality,
        embedArtwork,
        embedLyrics,
      })
      toast(`"${track.title}" queued for download`, 'success')
      closeDownloadModal()
    } catch (e) {
      // e.g. Wi-Fi-only mode on mobile data
      toast(e instanceof Error ? e.message : 'Download failed', 'error', 4000)
    }
  }

  return (
    <Modal
      open={!!trackId}
      onClose={closeDownloadModal}
      title="Download"
      size="md"
      className="max-h-[88dvh] overflow-y-auto"
    >
      {/* ── Track ─────────────────────────────────────────── */}
      {isLoading || isError ? (
        <div className="flex items-center gap-3 mb-5">
          <Skeleton className="w-14 h-14 rounded-2xl flex-shrink-0" />
          <div className="space-y-2 flex-1 min-w-0">
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </div>
        </div>
      ) : (
        track && (
          <div className="flex items-center gap-3 mb-5">
            <ArtworkImage
              src={track.artworkUrl}
              alt={track.title}
              size={56}
              radius="rounded-2xl"
              className="shadow-md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-[var(--text-primary)] truncate leading-snug">
                {track.title}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)] truncate mt-0.5">
                {track.artist?.name ?? 'Unknown Artist'}
                {typeof track.duration === 'number' && track.duration > 0 && (
                  <span className="text-[var(--text-muted)]"> · {formatDuration(track.duration)}</span>
                )}
              </p>
            </div>
            {track.isDownloaded && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent-border)] text-[var(--accent)] text-[11px] font-bold flex-shrink-0">
                <WifiOff className="w-3 h-3" />
                On device
              </span>
            )}
          </div>
        )
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">Couldn&apos;t load this track.</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {track && (
        <>
          {/* ── Format ────────────────────────────────────── */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
            Format
          </p>
          <div className="grid grid-cols-5 gap-2 mb-1">
            {FORMAT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={cn(
                  'h-11 rounded-xl text-[13px] font-bold transition-all duration-150 active:scale-95',
                  format === f.value
                    ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent-subtle)]'
                    : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-4">
            {lossless
              ? 'FLAC and WAV are lossless — no quality setting needed.'
              : selected?.value === 'opus'
                ? 'Opus — best quality per megabyte.'
                : selected?.value === 'mp3'
                  ? 'MP3 — plays on every device.'
                  : 'M4A — AAC in an MP4 container.'}
          </p>

          {/* ── Quality ──────────────────────────────────── */}
          {!lossless && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
                Quality
              </p>
              <div className="flex flex-wrap gap-2 mb-1">
                {QUALITY_OPTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={cn(
                      'px-3.5 h-9 rounded-full text-[13px] font-semibold transition-all duration-150 active:scale-95',
                      quality === q
                        ? 'bg-[var(--text-primary)] text-[var(--bg-base)]'
                        : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    )}
                  >
                    {q === 'best' ? 'Best' : `${q} kbps`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-4">
                {quality === 'best' ? 'yt-dlp picks the best stream available.' : 'Higher bitrate = bigger file.'}
              </p>
            </>
          )}

          {/* ── Extras ───────────────────────────────────── */}
          <div className="border-t border-[var(--border)] pt-3 mb-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">Embed artwork</p>
                <p className="text-[11px] text-[var(--text-muted)]">Save the cover inside the file</p>
              </div>
              <Switch on={embedArtwork} onToggle={() => setEmbedArtwork((v) => !v)} label="Embed artwork" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">Embed lyrics</p>
                <p className="text-[11px] text-[var(--text-muted)]">Save synced lyrics inside the file</p>
              </div>
              <Switch on={embedLyrics} onToggle={() => setEmbedLyrics((v) => !v)} label="Embed lyrics" />
            </div>
          </div>

          {/* ── Action ───────────────────────────────────── */}
          <Button fullWidth size="md" onClick={handleDownload} disabled={!track}>
            <Download className="w-4 h-4" />
            {lossless ? 'Download lossless' : `Download ${format.toUpperCase()}`}
          </Button>
          <p className="text-center text-[11px] text-[var(--text-muted)] mt-3">
            Queued downloads appear in My Music → Activity
          </p>
        </>
      )}
    </Modal>
  )
}
