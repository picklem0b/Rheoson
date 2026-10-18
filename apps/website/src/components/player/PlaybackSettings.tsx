import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Moon,
  SlidersHorizontal,
  ArrowsClockwise,
  Repeat,
  Gauge,
  ArrowsOutSimple,
} from '@phosphor-icons/react'
import SleepTimer from './SleepTimer'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { usePlayerStore } from '@/store/player.store'
import { useUIStore } from '@/store/ui.store'
import { getPlaybackRate, setPlaybackRate } from '@/hooks/player.hook'
import { cn } from '@/lib/utils'

/**
 * PlaybackSettings — every playback control in one sheet.
 *
 * Reached from the player's ••• overflow ("Playback settings"). Carries:
 * speed, repeat mode, shuffle, playthrough (what happens when the queue
 * ends) and the sleep timer. The EQ stays a dedicated surface because it
 * needs its own canvas and lanes; this drawer hands off to it.
 *
 * History note: this drawer once lived behind a dead mount point and the
 * sleep timer with it. The PlayerBar's overflow menu opens it via the
 * `rheoson:playback-settings` CustomEvent.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

type Playthrough = 'stop' | 'autoplay' | 'repeat-all'

function Row({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        {hint && <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Segmented({ options, value, onChange, ariaLabel }: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
}) {
  return (
    <div className="inline-flex rounded-full bg-[var(--bg-elevated)] p-0.5 flex-shrink-0" role="radiogroup" aria-label={ariaLabel}>
      {options.map(o => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-bold transition-colors',
            value === o.id
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function PlaybackSettings({ trigger = true }: { trigger?: boolean }) {
  const [open, setOpen] = useState(false)
  const [sleepOpen, setSleepOpen] = useState(false)
  const { toggleEqualizer } = useUIStore()

  const repeatMode = usePlayerStore(s => s.repeatMode)
  const isShuffled = usePlayerStore(s => s.isShuffled)
  const cycleRepeat = usePlayerStore(s => s.cycleRepeat)
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle)

  // Local speed state mirrors the engine (player.hook) and localStorage.
  const [speed, setSpeed] = useState(() => getPlaybackRate())

  // Playthrough: repeat-all counts as looping; autoplay preference drives
  // what happens when the queue exhausts. Kept in localStorage like the
  // other rheoson-* prefs — the audio engine reads it at track end.
  const [playthrough, setPlaythrough] = useState<Playthrough>(() => {
    const raw = localStorage.getItem('rheoson-autoplay')
    if (raw === 'false') return 'stop'
    return 'autoplay'
  })

  useEffect(() => {
    const open2 = () => setOpen(true)
    window.addEventListener('rheoson:playback-settings', open2)
    return () => window.removeEventListener('rheoson:playback-settings', open2)
  }, [])

  const chooseSpeed = (v: number) => {
    setSpeed(v)
    setPlaybackRate(v)
  }

  const choosePlaythrough = (id: string) => {
    if (id === 'autoplay') {
      localStorage.setItem('rheoson-autoplay', 'true')
      setPlaythrough('autoplay')
    } else if (id === 'stop') {
      localStorage.setItem('rheoson-autoplay', 'false')
      setPlaythrough('stop')
    }
  }

  return (
    <>
      {trigger && (
        <IconButton
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          title="Playback settings"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </IconButton>
      )}

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
                  <h3 className="font-bold text-[var(--text-primary)]">Playback settings</h3>
                  <IconButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 px-5 py-2 divide-y divide-[var(--border)]">
                  {/* Speed */}
                  <Row label="Speed" hint="Tempo of playback">
                    <Segmented
                      ariaLabel="Playback speed"
                      value={String(speed)}
                      onChange={id => chooseSpeed(parseFloat(id))}
                      options={SPEEDS.map(s => ({ id: String(s), label: `${s}×` }))}
                    />
                  </Row>

                  {/* Repeat */}
                  <Row label="Repeat" hint={repeatMode === 'one' ? 'This track loops' : repeatMode === 'all' ? 'The queue loops' : 'Off — stops at queue end'}>
                    <button
                      onClick={cycleRepeat}
                      aria-label="Change repeat mode"
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0',
                        repeatMode === 'off'
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                          : 'bg-[var(--accent-subtle)] text-[var(--accent)]',
                      )}
                    >
                      {repeatMode === 'one'
                        ? <Repeat className="w-4.5 h-4.5" weight="fill" />
                        : <ArrowsClockwise className="w-4.5 h-4.5" />}
                    </button>
                  </Row>

                  {/* Shuffle */}
                  <Row label="Shuffle" hint="Random order each run">
                    <button
                      onClick={toggleShuffle}
                      role="switch"
                      aria-checked={isShuffled}
                      aria-label="Shuffle"
                      className={cn(
                        'w-11 h-6 rounded-full relative transition-colors flex-shrink-0',
                        isShuffled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-elevated)] border border-[var(--border)]',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                          isShuffled ? 'left-[22px]' : 'left-0.5',
                        )}
                      />
                    </button>
                  </Row>

                  {/* Playthrough */}
                  <Row label="Playthrough" hint="What plays when the queue ends">
                    <Segmented
                      ariaLabel="Playthrough behaviour"
                      value={playthrough}
                      onChange={choosePlaythrough}
                      options={[
                        { id: 'stop', label: 'Stop' },
                        { id: 'autoplay', label: 'Keep going' },
                      ]}
                    />
                  </Row>

                  {/* EQ + Sleep hand-offs */}
                  <div className="py-3 space-y-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        toggleEqualizer()
                        setOpen(false)
                      }}
                    >
                      <SlidersHorizontal className="w-4 h-4" /> Equalizer
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setSleepOpen(true)
                        setOpen(false)
                      }}
                    >
                      <Moon className="w-4 h-4" /> Sleep timer
                    </Button>
                    <div className="flex items-center gap-2 pt-1 text-xs text-[var(--text-muted)]">
                      <Gauge className="w-4 h-4" />
                      <span>Speed applies to the current track instantly</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <ArrowsOutSimple className="w-4 h-4" />
                      <span>Repeat · Shuffle · Playthrough shape the queue</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
