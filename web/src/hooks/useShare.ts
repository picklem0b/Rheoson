import { useCallback } from 'react'
import { useToast } from '@/components/ui/Toaster'
import type { Track } from '@/types/track.types'

/**
 * useShare — Native sharing via Web Share API (mobile) with
 * clipboard fallback for desktop. Includes track metadata.
 */
export function useShare() {
  const { toast } = useToast()

  const share = useCallback(async (track: Track) => {
    const shareData = {
      title: track.title,
      text: `${track.title} by ${track.artist?.name ?? 'Unknown Artist'}`,
      url: `${window.location.origin}/search?q=${encodeURIComponent(
        track.title + ' ' + (track.artist?.name ?? '')
      )}`,
    }

    // Try native share (Android, iOS, modern browsers)
    if (navigator.share) {
      try {
        await navigator.share(shareData)
        return
      } catch (err) {
        // User cancelled or share failed — fall through to clipboard
        if ((err as Error).name === 'AbortError') return
      }
    }

    // Fallback: copy link to clipboard
    try {
      await navigator.clipboard.writeText(shareData.url)
      toast('Link copied to clipboard', 'success', 2000)
    } catch {
      // Clipboard API not available (e.g. non-HTTPS)
      toast('Could not share — copy the link manually', 'error', 3000)
    }
  }, [toast])

  return { share }
}
