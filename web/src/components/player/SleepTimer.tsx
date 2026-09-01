import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Moon, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { usePlayer } from '@/hooks/player.hook'
import { useToast } from '@/components/ui/Toaster'
import { cn } from '@/lib/utils'

const TIMER_OPTIONS = [
  { minutes: 15,  label: '15 min' },
  { minutes: 30,  label: '30 min' },
  { minutes: 45,  label: '45 min' },
  { minutes: 60,  label: '1 hour' },
  { minutes: 90,  label: '1.5 hr' },
  { minutes: 120, label: '2 hours' },
]

// Module-level timer state — persists across mount/unmount
let _endTime: number | null = null
let _remaining: number | null = null
let _timerInterval: ReturnType<typeof setInterval> | null = null
// Callback ref set by the component to trigger re-renders
let _tickCallback: (() => void) | null = null

function _startTick() {
  if (_timerInterval) return
  _timerInterval = setInterval(() => {
    if (_endTime === null) {
      clearInterval(_timerInterval!)
      _timerInterval = null
      return
    }
    const ms = _endTime - Date.now()
    if (ms <= 0) {
      // Timer expired
      _remaining = null
      _endTime = null
      clearInterval(_timerInterval!)
      _timerInterval = null
      // Import usePlayer pause — call via a stored reference
      _onExpired?.()
    } else {
      _remaining = Math.floor(ms / 1000)
    }
    _tickCallback?.()
  }, 1000)
}

// Callback set by the component when timer expires
let _onExpired: (() => void) | null = null

interface SleepTimerProps {
  open: boolean
  onClose: () => void
}

export default function SleepTimer({ open, onClose }: SleepTimerProps) {
  // Force re-render on tick — connected to module-level state
  const [, setTick] = useState(0)
  const { pause } = usePlayer()
  const { toast } = useToast()

  // Connect tick callback
  useEffect(() => {
    _tickCallback = () => setTick(n => n + 1)
    return () => { _tickCallback = null }
  }, [])

  // Set expiry handler
  useEffect(() => {
    _onExpired = () => {
      pause()
      toast('Sleep timer ended — playback paused', 'info', 3000)
      onClose()
    }
    return () => { _onExpired = null }
  }, [pause, toast, onClose])

  const remaining = _remaining
  const isActive = _endTime !== null

  const startTimer = useCallback((minutes: number) => {
    _endTime = Date.now() + minutes * 60 * 1000
    _remaining = minutes * 60
    _startTick()
    toast(`Sleep timer set for ${minutes} minutes`, 'success', 2000)
    onClose()
  }, [toast, onClose])

  const cancelTimer = useCallback(() => {
    _endTime = null
    _remaining = null
    if (_timerInterval) {
      clearInterval(_timerInterval)
      _timerInterval = null
    }
    toast('Sleep timer cancelled', 'info', 1500)
  }, [toast])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[61] p-4"
          >
            <div className="glass-strong rounded-3xl border border-[var(--border)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon className="w-5 h-5 text-[var(--accent)]" />
                  <h3 className="font-bold text-[var(--text-primary)]">Sleep Timer</h3>
                </div>
                <IconButton size="sm" variant="ghost" onClick={onClose}>
                  <X className="w-4 h-4" />
                </IconButton>
              </div>

              {/* Active timer */}
              {isActive && remaining !== null && (
                <div className="text-center py-4">
                  <div className="text-3xl font-bold text-[var(--accent)] tabular-nums">
                    {formatTime(remaining)}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">remaining</p>
                  <button
                    onClick={cancelTimer}
                    className="mt-3 px-4 py-2 rounded-full bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors"
                  >
                    Cancel Timer
                  </button>
                </div>
              )}

              {/* Timer options */}
              <div className="grid grid-cols-3 gap-2">
                {TIMER_OPTIONS.map(opt => (
                  <motion.button
                    key={opt.minutes}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => startTimer(opt.minutes)}
                    className={cn(
                      'py-3 rounded-2xl text-sm font-bold transition-all',
                      'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                      'border border-[var(--border)] hover:border-[var(--accent-border)]',
                      'hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)]'
                    )}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
