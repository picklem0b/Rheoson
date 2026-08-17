import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Mic2, ChevronDown } from 'lucide-react'
import { usePlayer } from '@/hooks/player.hook'
import { IconButton } from '@/components/ui/IconButton'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { cn } from '@/lib/utils'

interface LyricsLine {
  text:       string
  startTime?: number   // milliseconds from track start
}

interface LyricsOverlayProps {
  lines:      LyricsLine[]
  activeLine: number
  synced:     boolean
  onClose:    () => void
}

export default function LyricsOverlay({ lines, activeLine, synced, onClose }: LyricsOverlayProps) {
  const { seek } = usePlayer()

  // One ref per rendered line, so we can scroll the active one into view
  // automatically as the song plays — this is what makes the lyrics feel
  // "live" rather than just static text that happens to bold itself.
  const lineRefs = useRef<(HTMLButtonElement | HTMLParagraphElement | null)[]>([])

  useEffect(() => {
    const el = lineRefs.current[activeLine]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeLine])

  /** Tapping a synced lyric line jumps playback to that exact moment. */
  const handleLineTap = (line: LyricsLine) => {
    if (!synced || line.startTime === undefined) return
    seek(line.startTime / 1000) // startTime is in ms, seek() expects seconds
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0       }}
      exit={{   opacity: 0, y: '100%'   }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="absolute inset-x-0 bottom-0 top-24 glass-strong rounded-t-3xl z-20 overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Mic2 className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-bold text-[var(--text-primary)]">Lyrics</span>
          {!synced && <span className="text-xs text-[var(--text-muted)]">· Unsynced</span>}
        </div>
        <IconButton size="sm" variant="ghost" onClick={onClose}>
          <ChevronDown />
        </IconButton>
      </div>

      <ScrollArea className="h-[calc(100%-60px)] px-6 py-4">
        <div className="space-y-4 pb-8">
          {lines.map((line, i) => {
            const isTappable = synced && line.startTime !== undefined
            const Tag = isTappable ? motion.button : motion.p

            return (
              <Tag
                key={i}
                ref={(el: any) => { lineRefs.current[i] = el }}
                animate={{
                  opacity: i === activeLine ? 1 : 0.35,
                  scale:   i === activeLine ? 1.02 : 1,
                }}
                transition={{ duration: 0.3 }}
                onClick={isTappable ? () => handleLineTap(line) : undefined}
                whileTap={isTappable ? { scale: 0.97 } : undefined}
                className={cn(
                  'text-lg leading-relaxed transition-all duration-300 text-left w-full',
                  i === activeLine
                    ? 'font-bold text-[var(--text-primary)]'
                    : 'font-medium text-[var(--text-secondary)]',
                  // Tappable lines get a pointer cursor and a subtle hover
                  // cue so it's discoverable that you can jump to them
                  isTappable && 'cursor-pointer hover:opacity-80 active:opacity-60',
                )}
              >
                {line.text}
              </Tag>
            )
          })}
        </div>
      </ScrollArea>
    </motion.div>
  )
}