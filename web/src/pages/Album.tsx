import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, Shuffle, Heart, Download, MoreHorizontal } from 'lucide-react'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'

export default function Album() {
  const { id } = useParams()
  const G = ['from-cyan-900 to-blue-700', 'from-rose-900 to-red-700', 'from-amber-900 to-orange-700', 'from-emerald-900 to-green-700']

  return (
    <div className="flex flex-col h-full">
      <TopBar transparent />
      <ScrollArea className="flex-1">

        {/* Hero */}
        <div className="relative px-4 lg:px-8 pt-4 pb-8">
          <div className={cn('absolute inset-0 bg-gradient-to-b opacity-30', G[parseInt(id ?? '0') % G.length])} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--bg-base)]" />
          <div className="relative flex flex-col items-center text-center gap-4 pt-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 20 }}
              className={cn('w-52 h-52 rounded-3xl shadow-2xl bg-gradient-to-br', G[parseInt(id ?? '0') % G.length])}
            />
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Album {id}</h1>
              <p className="text-[var(--text-secondary)] text-sm mt-1">Artist Name · 2024 · 12 songs</p>
            </div>
            <div className="flex gap-3">
              <Button variant="primary" size="md"><Play className="w-4 h-4 fill-current" />Play</Button>
              <Button variant="secondary" size="md"><Shuffle className="w-4 h-4" />Shuffle</Button>
              <IconButton size="md" variant="ghost"><Heart /></IconButton>
              <IconButton size="md" variant="ghost"><Download /></IconButton>
            </div>
          </div>
        </div>

        {/* Tracks */}
        <div className="px-4 lg:px-8 pb-8 space-y-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
              className="w-full group flex items-center gap-4 px-3 py-3 rounded-2xl transition-colors text-left"
            >
              <span className="text-sm text-[var(--text-muted)] w-5 text-center group-hover:hidden">{i + 1}</span>
              <Play className="w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">Track {i + 1}</p>
                <p className="text-xs text-[var(--text-secondary)]">Artist Name</p>
              </div>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">3:{String(i * 13 % 60).padStart(2,'0')}</span>
            </motion.button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}