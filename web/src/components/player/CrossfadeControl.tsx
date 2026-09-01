import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import { usePersisted } from '@/hooks/persisted.hook'
import { cn } from '@/lib/utils'

const CROSSFADE_OPTIONS = [
  { value: 0,  label: 'Off' },
  { value: 2,  label: '2s' },
  { value: 4,  label: '4s' },
  { value: 6,  label: '6s' },
  { value: 8,  label: '8s' },
  { value: 12, label: '12s' },
]

interface CrossfadeControlProps {
  compact?: boolean
}

export default function CrossfadeControl({ compact = false }: CrossfadeControlProps) {
  const [crossfade, setCrossfade] = usePersisted<number>('crossfade', 0)

  return (
    <div className={cn('space-y-2', !compact && 'px-1')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-sm font-medium text-[var(--text-secondary)]">Crossfade</span>
        </div>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          {crossfade === 0 ? 'Off' : `${crossfade}s`}
        </span>
      </div>

      {compact ? (
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={crossfade}
          onChange={e => setCrossfade(parseInt(e.target.value))}
          className="w-full h-1 accent-[var(--accent)]"
        />
      ) : (
        <div className="flex gap-1.5">
          {CROSSFADE_OPTIONS.map(opt => (
            <motion.button
              key={opt.value}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCrossfade(opt.value)}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
                crossfade === opt.value
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'
              )}
            >
              {opt.label}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}
