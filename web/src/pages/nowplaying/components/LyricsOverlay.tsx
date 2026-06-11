import { motion, AnimatePresence } from 'framer-motion'
import { Mic2, ChevronDown } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { cn } from '@/lib/utils'

interface LyricsLine {
  text:      string
  startTime?: number
}

interface LyricsOverlayProps {
  lines:      LyricsLine[]
  activeLine: number
  synced:     boolean
  onClose:    () => void
}

export default function LyricsOverlay({ lines, activeLine, synced, onClose }: LyricsOverlayProps) {
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
          {lines.map((line, i) => (
            <motion.p
              key={i}
              animate={{
                opacity: i === activeLine ? 1 : 0.35,
                scale:   i === activeLine ? 1.02 : 1,
              }}
              transition={{ duration: 0.3 }}
              className={cn(
                'text-lg leading-relaxed transition-all duration-300',
                i === activeLine
                  ? 'font-bold text-[var(--text-primary)]'
                  : 'font-medium text-[var(--text-secondary)]',
              )}
            >
              {line.text}
            </motion.p>
          ))}
        </div>
      </ScrollArea>
    </motion.div>
  )
}
