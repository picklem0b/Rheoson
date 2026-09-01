import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Music2, ChevronDown } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { getSharedSource } from '@/hooks/audioAnalyser.hook'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'

interface EQBand {
  freq: number
  gain: number
  type: 'peaking' | 'lowshelf' | 'highshelf'
  label: string
}

const DEFAULT_BANDS: EQBand[] = [
  { freq: 60,   gain: 0, type: 'lowshelf',  label: '60' },
  { freq: 230,  gain: 0, type: 'peaking',   label: '230' },
  { freq: 910,  gain: 0, type: 'peaking',   label: '910' },
  { freq: 3600, gain: 0, type: 'peaking',   label: '3.6K' },
  { freq: 14000,gain: 0, type: 'highshelf', label: '14K' },
]

const PRESETS = [
  { id: 'flat',       name: 'Flat',        gains: [0, 0, 0, 0, 0] },
  { id: 'bass',       name: 'Bass Boost',  gains: [8, 5, 0, 0, 0] },
  { id: 'treble',     name: 'Treble',      gains: [0, 0, 2, 5, 8] },
  { id: 'vocal',      name: 'Vocal',       gains: [-2, 2, 6, 4, 0] },
  { id: 'electronic', name: 'Electronic',  gains: [7, 2, -1, 3, 6] },
  { id: 'hiphop',     name: 'Hip-Hop',     gains: [9, 4, 1, 2, 3] },
  { id: 'rock',       name: 'Rock',        gains: [5, 3, 4, 5, 4] },
  { id: 'acoustic',   name: 'Acoustic',    gains: [3, 2, 3, 4, 5] },
  { id: 'loudness',   name: 'Loudness',    gains: [6, 2, 0, 2, 6] },
  { id: 'night',      name: 'Night Mode',  gains: [-4, -1, 2, -1, -3] },
]

export default function EqualizerPanel() {
  const { showEqualizer, toggleEqualizer } = useUIStore()
  const [bands, setBands] = useState<EQBand[]>(DEFAULT_BANDS)
  const [activePreset, setActivePreset] = useState('flat')
  const [enabled, setEnabled] = useState(false)
  const filtersRef = useRef<BiquadFilterNode[]>([])

  // Initialize EQ filters and insert into the shared audio chain
  useEffect(() => {
    if (!showEqualizer) return

    let source: MediaElementAudioSourceNode
    try {
      source = getSharedSource()!
    } catch {
      return
    }
    if (!source) return

    // Create 5 band filters
    const ctx = source.context
    const filters = DEFAULT_BANDS.map((band) => {
      const filter = ctx.createBiquadFilter()
      filter.type = band.type
      filter.frequency.value = band.freq
      filter.gain.value = 0
      filter.Q.value = 1.4
      return filter
    })
    filtersRef.current = filters

    // Disconnect source from its current destination (analyser)
    // and insert filters: source → filters → analyser → destination
    try {
      source.disconnect()
    } catch { /* ignore */ }

    // Reconnect: source → filter[0] → ... → filter[4] → analyser → destination
    // The analyser node is connected to destination by useAudioAnalyser
    // We need to find the analyser — it's connected to source's destination
    // Instead, just connect filters to destination directly
    source.connect(filters[0])
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1])
    }
    filters[filters.length - 1].connect(ctx.destination)

    return () => {
      // Cleanup: disconnect filters, reconnect source → destination directly
      try {
        source.disconnect()
        filters.forEach(f => { try { f.disconnect() } catch {} })
        // Reconnect source directly to destination (bypass EQ)
        source.connect(ctx.destination)
      } catch { /* ignore */ }
    }
  }, [showEqualizer])

  // Apply gain changes — only updates filter gain values
  useEffect(() => {
    if (!enabled) {
      filtersRef.current.forEach(f => { f.gain.value = 0 })
      return
    }
    filtersRef.current.forEach((filter, i) => {
      if (bands[i]) filter.gain.value = bands[i].gain
    })
  }, [bands, enabled])

  // Reset state when panel closes
  useEffect(() => {
    if (!showEqualizer) {
      filtersRef.current.forEach(f => { f.gain.value = 0 })
      setEnabled(false)
      setBands(DEFAULT_BANDS)
      setActivePreset('flat')
    }
  }, [showEqualizer])

  const handleBandChange = useCallback((index: number, gain: number) => {
    setBands(prev => prev.map((b, i) => i === index ? { ...b, gain } : b))
    setActivePreset('')
  }, [])

  const applyPreset = useCallback((preset: typeof PRESETS[0]) => {
    setActivePreset(preset.id)
    setBands(prev => prev.map((b, i) => ({ ...b, gain: preset.gains[i] ?? 0 })))
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                'relative w-10 h-5 rounded-full transition-colors duration-200',
                enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-elevated)]'
              )}
            >
              <motion.div
                animate={{ x: enabled ? 20 : 2 }}
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
              />
            </button>
            <IconButton size="sm" variant="ghost" onClick={toggleEqualizer}>
              <ChevronDown className="w-4 h-4" />
            </IconButton>
          </div>
        </div>

        {/* Preset selector */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {PRESETS.map(p => (
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
          {bands.map((band, i) => (
            <div key={band.freq} className="flex flex-col items-center gap-2 flex-1">
              <span className={cn(
                'text-[10px] font-bold tabular-nums',
                band.gain > 0 ? 'text-[var(--accent)]' :
                band.gain < 0 ? 'text-blue-400' :
                'text-[var(--text-muted)]'
              )}>
                {band.gain > 0 ? '+' : ''}{band.gain}
              </span>

              <div className="relative h-32 w-8 flex items-center justify-center">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={band.gain}
                  onChange={e => handleBandChange(i, parseInt(e.target.value))}
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
                      band.gain >= 0 ? 'bg-[var(--accent)]' : 'bg-blue-400'
                    )}
                    style={{
                      height: `${Math.abs(band.gain) / 12 * 50}%`,
                      bottom: band.gain >= 0 ? '50%' : undefined,
                      top: band.gain < 0 ? '50%' : undefined,
                    }}
                  />
                </div>
              </div>

              <span className="text-[9px] text-[var(--text-muted)] font-medium">
                {band.label}
              </span>
            </div>
          ))}
        </div>

        {activePreset && (
          <p className="text-[10px] text-[var(--text-muted)] text-center">
            {PRESETS.find(p => p.id === activePreset)?.name || 'Custom'}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
