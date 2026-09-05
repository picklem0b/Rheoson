import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Music2, ChevronDown } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'
import {
  EQ_PRESETS,
  EQ_BANDS,
  setEQPreset,
  setBands,
  getBands,
  ensureEffectsChain,
} from '@/lib/audioEffects'

const EMPTY_GAINS = EQ_BANDS.map(() => 0)

/**
 * Equalizer panel — drives the persistent effects engine in lib/audioEffects,
 * so adjustments apply immediately, survive closing this panel, and stay in
 * sync with Settings → Audio → "Equaliser preset".
 */
export default function EqualizerPanel() {
  const { showEqualizer, toggleEqualizer } = useUIStore()
  const [gains, setGains] = useState<number[]>(EMPTY_GAINS)
  const [activePreset, setActivePreset] = useState<string>('flat')

  // Sync sliders from the engine whenever the panel opens
  useEffect(() => {
    if (!showEqualizer) return
    ensureEffectsChain() // attach if audio is already playing
    const applied = getBands()
    setGains(applied.length === 5 ? applied : EMPTY_GAINS)
  }, [showEqualizer])

  const handleBandChange = useCallback((index: number, gain: number) => {
    const next = [...gains]
    next[index] = gain
    setGains(next)
    setActivePreset('')
    setBands(next)
  }, [gains])

  const applyPreset = useCallback((preset: typeof EQ_PRESETS[0]) => {
    setActivePreset(preset.id)
    setGains(preset.gains)
    setEQPreset(preset.id)
  }, [])

  if (!showEqualizer) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="glass-strong rounded-3xl border border-[var(--border)] p-5 space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music2 className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="font-bold text-[var(--text-primary)]">Equalizer</h3>
          </div>
          <IconButton size="sm" variant="ghost" onClick={toggleEqualizer}>
            <ChevronDown className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Preset selector */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {EQ_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all',
                activePreset === p.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Band sliders */}
        <div className="flex items-end justify-between gap-3 pt-2">
          {EQ_BANDS.map((band, i) => {
            const gain = gains[i] ?? 0
            return (
              <div key={band.freq} className="flex flex-col items-center gap-2 flex-1">
                <span className={cn(
                  'text-[10px] font-bold tabular-nums',
                  gain > 0 ? 'text-[var(--accent)]' :
                  gain < 0 ? 'text-blue-400' :
                  'text-[var(--text-muted)]'
                )}>
                  {gain > 0 ? '+' : ''}{gain}
                </span>

                <div className="relative h-32 w-8 flex items-center justify-center">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={gain}
                    onChange={(e) => handleBandChange(i, parseInt(e.target.value))}
                    aria-label={`${band.freq} Hz band`}
                    className="h-32 w-8 appearance-none bg-transparent cursor-pointer"
                    style={{
                      writingMode: 'vertical-lr' as const,
                      direction: 'rtl' as const,
                    }}
                  />
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div
                      className={cn(
                        'absolute left-0 right-0 rounded-full transition-all',
                        gain >= 0 ? 'bg-[var(--accent)]' : 'bg-blue-400'
                      )}
                      style={{
                        height: `${Math.abs(gain) / 12 * 50}%`,
                        bottom: gain >= 0 ? '50%' : undefined,
                        top: gain < 0 ? '50%' : undefined,
                      }}
                    />
                  </div>
                </div>

                <span className="text-[9px] text-[var(--text-muted)] font-medium">
                  {band.freq >= 1000 ? `${band.freq / 1000}K` : band.freq}
                </span>
              </div>
            )
          })}
        </div>

        {activePreset && (
          <p className="text-[10px] text-[var(--text-muted)] text-center">
            {EQ_PRESETS.find((p) => p.id === activePreset)?.name ?? 'Custom'}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
