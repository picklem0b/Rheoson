import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Keyboard } from 'lucide-react'
import { IconButton } from './IconButton'

const SHORTCUTS = [
  { keys: ['Space'], description: 'Play / Pause' },
  { keys: ['←'], description: 'Seek backward 10s' },
  { keys: ['→'], description: 'Seek forward 10s' },
  { keys: ['↑'], description: 'Volume up' },
  { keys: ['↓'], description: 'Volume down' },
  { keys: ['N'], description: 'Next track' },
  { keys: ['P'], description: 'Previous track' },
  { keys: ['R'], description: 'Cycle repeat mode' },
  { keys: ['S'], description: 'Toggle shuffle' },
  { keys: ['Q'], description: 'Toggle queue panel' },
  { keys: ['L'], description: 'Toggle lyrics panel' },
  { keys: ['M'], description: 'Mute / Unmute' },
  { keys: ['F'], description: 'Toggle fullscreen player' },
  { keys: ['?'], description: 'Show this help' },
]

export default function ShortcutsModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      <IconButton
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="w-4 h-4" />
      </IconButton>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-[61] flex items-center justify-center p-4"
              onClick={() => setOpen(false)}
            >
              <div
                className="w-full max-w-md glass-strong rounded-3xl border border-[var(--border)] shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2.5">
                    <Keyboard className="w-5 h-5 text-[var(--accent)]" />
                    <h2 className="font-bold text-[var(--text-primary)]">
                      Keyboard Shortcuts
                    </h2>
                  </div>
                  <IconButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>

                {/* Shortcuts list */}
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto no-scrollbar">
                  <div className="space-y-2">
                    {SHORTCUTS.map(({ keys, description }) => (
                      <div
                        key={description}
                        className="flex items-center justify-between py-2"
                      >
                        <span className="text-sm text-[var(--text-secondary)]">
                          {description}
                        </span>
                        <div className="flex items-center gap-1">
                          {keys.map(k => (
                            <kbd
                              key={k}
                              className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-mono font-bold text-[var(--text-primary)] min-w-[28px] text-center"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]">
                  <p className="text-[10px] text-[var(--text-muted)] text-center">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border)] text-[9px] font-mono">?</kbd> to toggle this panel
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
