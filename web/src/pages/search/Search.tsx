import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search as SearchIcon, X, User } from 'lucide-react'
import { useSearch } from '@/hooks/useSearch'
import { useQueue } from '@/hooks/useQueue'
import { useUIStore } from '@/store/uiStore'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Badge } from '@/components/ui/Badge'
import { formatDuration, truncate } from '@/lib/formatters'
import { detectInputType, cn } from '@/lib/utils'
import { SearchBar } from './components/SearchBar'
import { CategoryGrid, ResultSection } from './components/CategoryGrid'
import type { SearchFilter } from '@/types/search'

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all',       label: 'All'       },
  { id: 'tracks',    label: 'Tracks'    },
  { id: 'albums',    label: 'Albums'    },
  { id: 'artists',   label: 'Artists'   },
  { id: 'playlists', label: 'Playlists' },
]

export default function Search() {
  const { query, setQuery, filter, setFilter, results, isLoading, error, clear, suggestions, selectSuggestion } = useSearch()
  const { playTrack }       = useQueue()
  const { openDownloadModal } = useUIStore()

  const inputType = query ? detectInputType(query) : 'query'
  const hasResults = results && (
    results.tracks.length  > 0 ||
    results.albums.length  > 0 ||
    results.artists.length > 0
  )

  return (
    <div className="flex flex-col h-full">

      {/* ── Search bar ──────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-6 pb-4 space-y-3 flex-shrink-0">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Search</h1>

        <SearchBar
          query={query}
          onChange={setQuery}
          onClear={clear}
          onSubmit={() => {}}
          isLoading={isLoading}
          suggestions={suggestions}
          onSelectSuggestion={selectSuggestion}
        />

        {/* Filter pills */}
        <AnimatePresence>
          {query && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{   opacity: 0, height: 0       }}
              className="flex gap-2 overflow-x-auto no-scrollbar"
            >
              {FILTERS.map((f) => (
                <motion.button
                  key={f.id}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0',
                    'border transition-all duration-200',
                    filter === f.id
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                      : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)]',
                  )}
                >
                  {f.label}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ScrollArea className="flex-1 px-4 lg:px-8">
        <AnimatePresence mode="wait">

          {/* ── No query: categories ────────────────────────── */}
          {!query && (
            <motion.div key="categories" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CategoryGrid onSelect={(cat) => setQuery(cat)} />
            </motion.div>
          )}

          {/* ── Error ───────────────────────────────────────── */}
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center py-16 gap-3"
            >
              <div className="w-14 h-14 rounded-3xl bg-red-500/10 flex items-center justify-center">
                <X className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-[var(--text-secondary)] text-sm text-center">{error}</p>
            </motion.div>
          )}

          {/* ── Results ─────────────────────────────────────── */}
          {!error && results && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6 pb-6"
            >
              {/* URL badge */}
              {(inputType === 'spotify' || inputType === 'youtube') && (
                <div className="flex items-center gap-2">
                  <Badge variant="accent">
                    {inputType === 'spotify' ? '🎵 Spotify link' : '▶ YouTube link'}
                  </Badge>
                  <span className="text-xs text-[var(--text-muted)]">Resolving…</span>
                </div>
              )}

              {/* Tracks */}
              {results.tracks.length > 0 && (
                <ResultSection title="Tracks" count={results.tracks.length}>
                  <div className="space-y-1">
                    {results.tracks.map((track, i) => (
                      <motion.div
                        key={track.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                        onClick={() => playTrack(track, results.tracks)}
                      >
                        <img
                          src={track.artworkUrl}
                          alt={track.title}
                          className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
                          <p className="text-xs text-[var(--text-secondary)] truncate">
                            {track.artist.name} · {track.album.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-[var(--text-muted)] tabular-nums">
                            {formatDuration(track.duration)}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => { e.stopPropagation(); openDownloadModal(track.id) }}
                            className={cn(
                              'opacity-0 group-hover:opacity-100 transition-opacity',
                              'text-xs font-semibold px-3 py-1 rounded-full',
                              'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)]',
                            )}
                          >
                            Save
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Artists */}
              {results.artists.length > 0 && (
                <ResultSection title="Artists" count={results.artists.length}>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                    {results.artists.map((artist, i) => (
                      <motion.button
                        key={artist.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        className="flex-shrink-0 flex flex-col items-center gap-2 w-24"
                      >
                        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-center">
                          {artist.imageUrl
                            ? <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
                            : <User className="w-8 h-8 text-[var(--text-muted)]" />
                          }
                        </div>
                        <p className="text-xs font-semibold text-[var(--text-primary)] text-center truncate w-full">
                          {artist.name}
                        </p>
                      </motion.button>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Albums */}
              {results.albums.length > 0 && (
                <ResultSection title="Albums" count={results.albums.length}>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                    {results.albums.map((album, i) => (
                      <motion.button
                        key={album.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.03, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        className="flex-shrink-0 w-36 text-left"
                      >
                        <img
                          src={album.artworkUrl}
                          alt={album.title}
                          className="w-36 h-36 rounded-2xl object-cover border border-[var(--border)] mb-2 shadow-md"
                        />
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{album.title}</p>
                        <p className="text-[10px] text-[var(--text-muted)] truncate">{album.artist.name}</p>
                      </motion.button>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Empty */}
              {!hasResults && query && !isLoading && (
                <div className="flex flex-col items-center py-20 gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center">
                    <SearchIcon className="w-7 h-7 text-[var(--text-muted)]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[var(--text-primary)] font-semibold">
                      No results for "{truncate(query, 24)}"
                    </p>
                    <p className="text-[var(--text-muted)] text-sm mt-1">
                      Try a different search or paste a link
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ScrollArea>
    </div>
  )
}
