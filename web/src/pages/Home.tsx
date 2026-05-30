import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, TrendingUp, Clock, Flame } from 'lucide-react'
import { useQueue } from '@/hooks/useQueue'
import { usePlayerStore } from '@/store/playerStore'
import { ScrollArea } from '@/components/ui/ScrollArea'
import TopBar from '@/components/layout/TopBar'
import { Skeleton, CardSkeleton } from '@/components/ui/Skeleton'
import { IconButton } from '@/components/ui/IconButton'
import { formatDuration, truncate } from '@/lib/formatters'
import { cn } from '@/lib/utils'

// ── Stagger animation helper ─────────────────────────────────
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}
const item = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', damping: 22, stiffness: 280 } },
}

// ── Mock data (replace with real API calls) ──────────────────
const RECENT = [
  { id: '1', title: 'Liked Songs',    subtitle: '248 songs',  color: '#5b21b6', gradient: 'from-purple-900 to-purple-600' },
  { id: '2', title: 'Heavy Rotation', subtitle: 'Mix',        color: '#be123c', gradient: 'from-rose-900 to-rose-600' },
  { id: '3', title: 'Discover Mix',   subtitle: 'Mix',        color: '#0e7490', gradient: 'from-cyan-900 to-cyan-600' },
  { id: '4', title: 'Late Night',     subtitle: 'Playlist',   color: '#1d4ed8', gradient: 'from-blue-900 to-blue-600' },
  { id: '5', title: 'Workout',        subtitle: 'Playlist',   color: '#b45309', gradient: 'from-amber-900 to-amber-600' },
  { id: '6', title: 'Chill Vibes',    subtitle: 'Mix',        color: '#065f46', gradient: 'from-emerald-900 to-emerald-600' },
]

export default function Home() {
  const navigate    = useNavigate()
  const { playAll } = useQueue()

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <>
      <TopBar showLogo transparent />
      <ScrollArea className="h-full">
        <div className="px-4 lg:px-8 pt-8 pb-4 space-y-10">

        {/* ── Header ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">
            {greeting()}
          </h1>
        </motion.div>

        {/* ── Quick picks grid ────────────────────────────── */}
        <motion.section variants={container} initial="hidden" animate="show">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {RECENT.map((item_) => (
              <motion.button
                key={item_.id}
                variants={item}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/playlist/${item_.id}`)}
                className={cn(
                  'group relative flex items-center gap-3 rounded-2xl overflow-hidden',
                  'bg-[var(--bg-elevated)] border border-[var(--border)]',
                  'text-left transition-all duration-200 h-16',
                  'hover:border-[var(--border-strong)] hover:shadow-lg'
                )}
              >
                <div className={cn('w-16 h-full bg-gradient-to-br flex-shrink-0', item_.gradient)} />
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{item_.title}</p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">{item_.subtitle}</p>
                </div>
                <div className="absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg">
                    <Play className="w-4 h-4 text-white fill-current translate-x-0.5" />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.section>

        {/* ── Featured Mix ─────────────────────────────────── */}
        <Section title="Featured Mix" icon={<Flame className="w-4 h-4 text-orange-400" />}>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <FeaturedCard key={i} index={i} />
            ))}
          </div>
        </Section>

        {/* ── Recently Played ──────────────────────────────── */}
        <Section title="Recently Played" icon={<Clock className="w-4 h-4 text-[var(--text-muted)]" />}>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <SmallCard key={i} index={i} />
            ))}
          </div>
        </Section>

        {/* ── Trending ─────────────────────────────────────── */}
        <Section title="Trending" icon={<TrendingUp className="w-4 h-4 text-[var(--accent)]" />}>
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <TrendingRow key={i} index={i} />
            ))}
          </div>
        </Section>

      </div>
    </ScrollArea>
  </>
  )
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, icon, children }: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ type: 'spring', damping: 22 }}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
      </div>
      {children}
    </motion.section>
  )
}

// ── Featured card ─────────────────────────────────────────────
const GRADIENTS = [
  'from-rose-900 via-rose-800 to-red-900',
  'from-violet-900 via-violet-800 to-purple-900',
  'from-cyan-900 via-cyan-800 to-blue-900',
  'from-amber-900 via-amber-800 to-orange-900',
  'from-emerald-900 via-emerald-800 to-green-900',
  'from-pink-900 via-pink-800 to-rose-900',
]

function FeaturedCard({ index }: { index: number }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-40 group"
    >
      <div className={cn(
        'w-40 h-40 rounded-3xl bg-gradient-to-br mb-3 relative overflow-hidden',
        'border border-[var(--border)] shadow-lg',
        GRADIENTS[index % GRADIENTS.length]
      )}>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/30">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-xl">
            <Play className="w-5 h-5 text-black fill-current translate-x-0.5" />
          </div>
        </div>
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)] truncate text-left">Mix {index + 1}</p>
      <p className="text-xs text-[var(--text-secondary)] text-left">Based on your taste</p>
    </motion.button>
  )
}

// ── Small card ────────────────────────────────────────────────
function SmallCard({ index }: { index: number }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-32 group"
    >
      <div className={cn(
        'w-32 h-32 rounded-2xl mb-3 relative overflow-hidden',
        'border border-[var(--border)] shadow-md',
        GRADIENTS[(index + 2) % GRADIENTS.length],
        'bg-gradient-to-br'
      )}>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
          <Play className="w-5 h-5 text-white fill-current" />
        </div>
      </div>
      <p className="text-xs font-semibold text-[var(--text-primary)] truncate text-left">Track {index + 1}</p>
      <p className="text-[10px] text-[var(--text-muted)] text-left">Artist Name</p>
    </motion.button>
  )
}

// ── Trending row ──────────────────────────────────────────────
function TrendingRow({ index }: { index: number }) {
  return (
    <motion.button
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center gap-4 px-3 py-3 rounded-2xl transition-colors duration-150 group"
    >
      <span className="text-sm font-bold text-[var(--text-muted)] w-5 text-center tabular-nums">
        {index + 1}
      </span>
      <div className={cn(
        'w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br',
        GRADIENTS[(index + 1) % GRADIENTS.length]
      )} />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">Trending Track {index + 1}</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">Artist Name</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-muted)] tabular-nums">3:4{index}</span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-white fill-current translate-x-0.5" />
          </div>
        </div>
      </div>
    </motion.button>
  )
}