import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidersHorizontal, Clock, ArrowUpDown, Library } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchFilters {
  minDuration: number  // seconds
  maxDuration: number  // 0 = no limit
  sortBy: 'relevance' | 'duration_asc' | 'duration_desc' | 'title'
  libraryOnly: boolean
}

const DURATION_PRESETS = [
  { label: 'Any', min: 0, max: 0 },
  { label: 'Short (<3m)', min: 0, max: 180 },
  { label: '3-5m', min: 180, max: 300 },
  { label: '5-10m', min: 300, max: 600 },
  { label: 'Long (>10m)', min: 600, max: 0 },
]

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'duration_asc', label: 'Shortest first' },
  { value: 'duration_desc', label: 'Longest first' },
  { value: 'title', label: 'A-Z' },
]

interface AdvancedFiltersProps {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
}

export default function AdvancedFilters({ filters, onChange }: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all',
          'border',
          open
            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]'
        )}
      >
        <SlidersHorizontal className="w-3 h-3" />
        Filters
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3"
          >
            <div className="space-y-4 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
              {/* Duration */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">Duration</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {DURATION_PRESETS.map(preset => {
                    const active = filters.minDuration === preset.min && filters.maxDuration === preset.max
                    return (
                      <button
                        key={preset.label}
                        onClick={() => onChange({
                          ...filters,
                          minDuration: preset.min,
                          maxDuration: preset.max,
                        })}
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-medium transition-all',
                          active
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border)]'
                        )}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Sort */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">Sort by</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => onChange({ ...filters, sortBy: opt.value as SearchFilters['sortBy'] })}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium transition-all',
                        filters.sortBy === opt.value
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border)]'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Library only */}
              <div>
                <button
                  onClick={() => onChange({ ...filters, libraryOnly: !filters.libraryOnly })}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl w-full transition-all',
                    filters.libraryOnly
                      ? 'bg-[var(--accent-subtle)] border border-[var(--accent-border)]'
                      : 'bg-[var(--bg-surface)] border border-[var(--border)]'
                  )}
                >
                  <Library className={cn('w-4 h-4', filters.libraryOnly ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')} />
                  <span className={cn('text-sm font-medium', filters.libraryOnly ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]')}>
                    Library only
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
