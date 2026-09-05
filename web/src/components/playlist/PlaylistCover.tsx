import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ImagePlus, Camera, X, Check, Music2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toaster'
import { playlistsApi } from '@/api/playlists.api'
import { cn } from '@/lib/utils'

/**
 * Playlist covers.
 *
 * `artworkUrl` may hold:
 *  - ""             → fall back to the gradient derived from the playlist id
 *  - a real URL     → http(s), blob or data URL (uploaded image)
 *  - "gradient:<i>" → a stored gradient choice
 */

export const PLAYLIST_GRADIENTS = [
  'from-rose-900 via-rose-800 to-red-900',
  'from-violet-900 via-violet-800 to-purple-900',
  'from-cyan-900 via-cyan-800 to-blue-900',
  'from-amber-900 via-amber-800 to-orange-900',
  'from-emerald-900 via-emerald-800 to-green-900',
  'from-pink-900 via-pink-800 to-rose-900',
  'from-indigo-900 via-indigo-800 to-violet-900',
  'from-teal-900 via-teal-800 to-cyan-900',
]

export function isGradientCover(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('gradient:')
}

export function gradientIndexFor(url: string | undefined, fallback: number): number {
  if (isGradientCover(url)) {
    const i = parseInt(url.slice('gradient:'.length), 10)
    if (!Number.isNaN(i) && i >= 0 && i < PLAYLIST_GRADIENTS.length) return i
  }
  return fallback
}

interface PlaylistCoverProps {
  url?: string
  alt?: string
  fallbackIndex?: number
  className?: string
  iconClassName?: string
}

/** Renders a playlist cover — image when available, gradient otherwise. */
export function PlaylistCover({ url, alt = '', fallbackIndex = 0, className, iconClassName }: PlaylistCoverProps) {
  const g = gradientIndexFor(url, fallbackIndex)
  return (
    <div className={cn('relative overflow-hidden flex-shrink-0', className)}>
      {url && !isGradientCover(url) ? (
        <img
          src={url}
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <div className={cn('w-full h-full bg-gradient-to-br', PLAYLIST_GRADIENTS[g])} />
      )}
      {(!url || isGradientCover(url)) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Music2 className={cn('text-white/50', iconClassName ?? 'w-10 h-10')} />
        </div>
      )}
    </div>
  )
}

// ── Cover editor modal ─────────────────────────────────────────

interface PlaylistCoverEditorProps {
  open: boolean
  playlistId: string
  currentUrl?: string
  onClose: () => void
  onSaved: () => void
}

export function PlaylistCoverEditor({ open, playlistId, currentUrl, onClose, onSaved }: PlaylistCoverEditorProps) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const save = async (artworkUrl: string) => {
    setSaving(true)
    try {
      await playlistsApi.updatePlaylist(playlistId, { artworkUrl })
      toast('Cover updated', 'success')
      onSaved()
      onClose()
    } catch {
      toast('Could not update cover', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      toast('Image too large — keep it under 3 MB', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') save(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <Modal open={open} onClose={onClose} title="Change cover" size="sm">
      {/* Current preview */}
      <div className="flex justify-center mb-5">
        <PlaylistCover
          url={currentUrl}
          alt="Playlist cover"
          className="w-36 h-36 rounded-3xl shadow-2xl border border-[var(--border)]"
          iconClassName="w-12 h-12"
        />
      </div>

      {/* Upload */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50"
      >
        <ImagePlus className="w-4 h-4" />
        Upload image
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          or pick a colour
        </span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      {/* Gradient swatches */}
      <div className="grid grid-cols-4 gap-2.5">
        {PLAYLIST_GRADIENTS.map((g, i) => {
          const selected = gradientIndexFor(currentUrl, -1) === i
          return (
            <motion.button
              key={g}
              whileTap={{ scale: 0.9 }}
              disabled={saving}
              onClick={() => save(`gradient:${i}`)}
              className={cn(
                'relative aspect-square rounded-2xl bg-gradient-to-br border-2 transition-all',
                g,
                selected ? 'border-[var(--accent)] scale-95' : 'border-transparent'
              )}
            >
              {selected && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Check className="w-5 h-5 text-white drop-shadow" />
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Remove cover */}
      {currentUrl && (
        <button
          onClick={() => save('')}
          disabled={saving}
          className="mt-4 w-full flex items-center justify-center gap-2 h-10 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm font-semibold text-[var(--text-muted)] hover:text-red-400 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          Remove cover
        </button>
      )}

      {/* Hint */}
      <p className="mt-4 text-center text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1.5">
        <Camera className="w-3 h-3" />
        Uploaded images are stored on your device
      </p>
    </Modal>
  )
}