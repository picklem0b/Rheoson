import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ── CategoryGrid ──────────────────────────────────────────────

const CATEGORIES = [
  { label: 'Hip-Hop',    gradient: 'from-yellow-900 to-orange-800' },
  { label: 'Electronic', gradient: 'from-cyan-900 to-blue-800'     },
  { label: 'R&B',        gradient: 'from-rose-900 to-pink-800'     },
  { label: 'Rock',       gradient: 'from-zinc-900 to-zinc-700'     },
  { label: 'Afrobeats',  gradient: 'from-green-900 to-emerald-700' },
  { label: 'Jazz',       gradient: 'from-amber-900 to-yellow-700'  },
  { label: 'Pop',        gradient: 'from-violet-900 to-purple-700' },
  { label: 'Classical',  gradient: 'from-slate-900 to-slate-700'   },
  { label: 'Soul',       gradient: 'from-red-900 to-rose-800'      },
  { label: 'Drill',      gradient: 'from-neutral-900 to-stone-700' },
]

interface CategoryGridProps {
  onSelect: (category: string) => void
}

export function CategoryGrid({ onSelect }: CategoryGridProps) {
  return (
    <>
      <p className="text-sm font-bold text-[var(--text-primary)] mb-4">Browse categories</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-6">
        {CATEGORIES.map((cat, i) => (
          <motion.button
            key={cat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(cat.label)}
            className={cn(
              'h-20 rounded-3xl overflow-hidden relative bg-gradient-to-br',
              cat.gradient, 'border border-[var(--border)]',
            )}
          >
            <span className="absolute bottom-3 left-3 text-sm font-bold text-white drop-shadow">
              {cat.label}
            </span>
          </motion.button>
        ))}
      </div>
    </>
  )
}

// ── ResultSection ─────────────────────────────────────────────

interface ResultSectionProps {
  title:    string
  count:    number
  children: React.ReactNode
}

export function ResultSection({ title, count, children }: ResultSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
        <span className="text-xs text-[var(--text-muted)]">{count}</span>
      </div>
      {children}
    </div>
  )
}
