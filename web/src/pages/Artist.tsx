import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, UserPlus } from 'lucide-react'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export default function Artist() {
  const { id } = useParams()
  const G = ['from-rose-900 to-pink-700', 'from-violet-900 to-indigo-700', 'from-cyan-900 to-sky-700', 'from-amber-900 to-yellow-700']

  return (
    <div className="flex flex-col h-full">
      <TopBar transparent />
      <ScrollArea className="flex-1">

        {/* Hero */}
        <div className="relative h-64 flex items-end overflow-hidden">
          <div className={cn('absolute inset-0 bg-gradient-to-br', G[parseInt(id ?? '0') % G.length])} />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-base)] via-transparent to-transparent" />
          <div className="relative px-4 lg:px-8 pb-6 w-full">
            <h1 className="text-4xl font-bold text-white drop-shadow-lg">Artist {id}</h1>
            <p className="text-sm text-white/70 mt-1">4.2M monthly listeners</p>
          </div>
        </div>

        <div className="px-4 lg:px-8 pb-8 space-y-8">
          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" size="lg"><Play className="w-5 h-5 fill-current" />Play</Button>
            <Button variant="secondary" size="md"><UserPlus className="w-4 h-4" />Follow</Button>
          </div>

          {/* Popular tracks */}
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Popular</h2>
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
                  className="w-full group flex items-center gap-4 px-3 py-3 rounded-2xl transition-colors text-left"
                >
                  <span className="text-sm text-[var(--text-muted)] w-5 text-center group-hover:hidden">{i + 1}</span>
                  <Play className="w-4 h-4 fill-current text-[var(--text-primary)] hidden group-hover:block" />
                  <div className={cn('w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br', G[i % G.length])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">Top Track {i + 1}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{(Math.random() * 10 + 1).toFixed(1)}M plays</p>
                  </div>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">3:{String(i * 17 % 60).padStart(2,'0')}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Albums */}
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Albums</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.04, y: -3 }}
                  whileTap={{ scale: 0.96 }}
                  className="flex-shrink-0 w-36 text-left"
                >
                  <div className={cn('w-36 h-36 rounded-2xl mb-2 bg-gradient-to-br border border-[var(--border)]', G[(i + 2) % G.length])} />
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">Album {i + 1}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">202{i + 1}</p>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}