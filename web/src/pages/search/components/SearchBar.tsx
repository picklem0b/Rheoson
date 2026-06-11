import { motion, AnimatePresence } from 'framer-motion'
import { Search as SearchIcon, X, Loader2, Link } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn, detectInputType } from '@/lib/utils'

interface SearchBarProps {
  query:     string
  onChange:  (v: string) => void
  onClear:   () => void
  onSubmit:  () => void
  isLoading: boolean
  suggestions: string[]
  onSelectSuggestion: (s: string) => void
}

export function SearchBar({
  query, onChange, onClear, onSubmit,
  isLoading, suggestions, onSelectSuggestion,
}: SearchBarProps) {
  const inputType = query ? detectInputType(query) : 'query'

  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
        {isLoading
          ? <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
          : inputType === 'spotify' || inputType === 'youtube'
            ? <Link className="w-4 h-4 text-[var(--accent)]" />
            : <SearchIcon className="w-4 h-4 text-[var(--text-muted)]" />
        }
      </div>

      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
          if (e.key === 'Escape') onClear()
        }}
        placeholder="Songs, artists, albums or paste a link…"
        className={cn(
          'w-full h-12 pl-11 pr-11 text-sm rounded-2xl outline-none transition-all duration-200',
          'bg-[var(--bg-elevated)] border border-[var(--border)]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
          'focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-subtle)]',
        )}
      />

      {query && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
        >
          <IconButton size="xs" variant="ghost" onClick={onClear}>
            <X />
          </IconButton>
        </motion.div>
      )}

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: -8,  scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              'absolute top-full left-0 right-0 mt-2 z-50',
              'glass-strong rounded-2xl border border-[var(--border)]',
              'overflow-hidden shadow-2xl',
            )}
          >
            {suggestions.map((s, i) => (
              <motion.button
                key={s}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onSelectSuggestion(s)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left',
                  'hover:bg-[var(--bg-elevated)] transition-colors',
                  'border-b border-[var(--border)] last:border-0',
                )}
              >
                <SearchIcon className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                <span className="text-sm text-[var(--text-primary)]">{s}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
