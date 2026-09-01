import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Music2, Moon, X } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { IconButton } from '@/components/ui/IconButton'
import CrossfadeControl from './CrossfadeControl'
import SleepTimer from './SleepTimer'
import { cn } from '@/lib/utils'

type Tab = 'crossfade' | 'equalizer' | 'sleep'

/**
 * PlaybackSettings — unified drawer for all playback customization.
 * Crossfade, equalizer presets, and sleep timer in one place.
 */
export default function PlaybackSettings() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('crossfade')
  const [sleepOpen, setSleepOpen] = useState(false)
  const { toggleEqualizer } = useUIStore()

  return (
    <>
      <IconButton
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Playback settings"
      >
        <Settings className="w-4 h-4" />
      </IconButton>

      <SleepTimer open={sleepOpen} onClose={() => setSleepOpen(false)} />

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
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[61] p-4 max-h-[70vh]"
            >
              <div className="glass-strong rounded-3xl border border-[var(--border)] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
                  <h3 className="font-bold text-[var(--text-primary)]">Playback Settings</h3>
                  <IconButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-[var(--border)] flex-shrink-0">
                  {([
                    { id: 'crossfade' as Tab, icon: Settings, label: 'Crossfade' },
                    { id: 'equalizer' as Tab, icon: Music2, label: 'Equalizer' },
                    { id: 'sleep' as Tab, icon: Moon, label: 'Sleep' },
                  ]).map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTab(t.id)
                        if (t.id === 'equalizer') {
                          toggleEqualizer()
                          setOpen(false)
                        }
                        if (t.id === 'sleep') {
                          setSleepOpen(true)
                          setOpen(false)
                        }
                      }}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors border-b-2 -mb-px',
                        tab === t.id
                          ? 'text-[var(--accent)] border-[var(--accent)]'
                          : 'text-[var(--text-muted)] border-transparent'
                      )}
                    >
                      <t.icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Content */}
                <div className="p-5 overflow-y-auto flex-1">
                  {tab === 'crossfade' && <CrossfadeControl />}
                  {tab === 'equalizer' && (
                    <p className="text-sm text-[var(--text-muted)] text-center py-8">
                      Opening equalizer panel...
                    </p>
                  )}
                  {tab === 'sleep' && (
                    <p className="text-sm text-[var(--text-muted)] text-center py-8">
                      Opening sleep timer...
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
