import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Download, HardDrive, Search, X, Music2, FolderOpen } from 'lucide-react'
import { useDownloads } from '@/hooks/downloads.hook'
import { tracksApi } from '@/api/tracks.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import DownloadRow from './components/DownloadRow'
import LibraryTrackRow from './components/LibraryTrackRow'

/**
 * My Music — one unified page for everything on this device.
 *
 *  - Downloads (in progress + recently completed) sit at the top whenever
 *    there's activity, with live progress and retry/cancel.
 *  - Your library (local tracks, downloaded ones badged) fills the rest,
 *    filterable by search.
 */
export default function Downloads() {
  const { jobs, activeJobs, completedJobs, cancel, retry, clearDone } = useDownloads()
  const [query, setQuery] = useState('')

  const { data: localTracks, isLoading: loadingLocal } = useQuery({
    queryKey:  ['tracks', 'all'],
    queryFn:   tracksApi.getAll,
    staleTime: 10_000,
    retry:     1,
  })

  const downloadedCount = useMemo(
    () => localTracks?.filter(t => t.isDownloaded).length ?? 0,
    [localTracks]
  )
  const localCount = localTracks?.length ?? 0

  // Recent completed jobs (all of them, newest first) — newest on top.
  const recentDone = useMemo(
    () => [...completedJobs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [completedJobs]
  )

  // Filtered library rows.
  const filteredTracks = useMemo(() => {
    if (!localTracks) return []
    const q = query.trim().toLowerCase()
    if (!q) return localTracks
    return localTracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.artist?.name ?? '').toLowerCase().includes(q) ||
      (t.album?.title ?? '').toLowerCase().includes(q)
    )
  }, [localTracks, query])

  const hasJobs = jobs.length > 0

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-6 pb-4 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Music</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {localCount} tracks · {downloadedCount} on device
              {hasJobs ? ` · ${activeJobs.length} downloading` : ''}
            </p>
          </div>
          {hasJobs && (
            <Button variant="ghost" size="sm" onClick={clearDone}>
              Clear done
            </Button>
          )}
        </div>

        {/* Search — filters the library */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter your music…"
            className="w-full h-11 pl-10 pr-9 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]
                       text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                       outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-subtle)] transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors"
              aria-label="Clear filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-6">

        {/* ── Downloads (activity) — only when there's something ── */}
        {hasJobs && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-7"
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[var(--accent)]" />
                <p className="text-sm font-bold text-[var(--text-primary)]">Downloads</p>
                {activeJobs.length > 0 && (
                  <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded-full tabular-nums">
                    {activeJobs.length} active
                  </span>
                )}
              </div>
            </div>

            <AnimatePresence mode="popLayout">
              <div className="space-y-2">
                {/* Active + queued first */}
                {activeJobs.map((job, i) => (
                  <DownloadRow
                    key={job.id}
                    job={job}
                    index={i}
                    onCancel={() => cancel(job.id)}
                    onRetry={() => retry(job.id)}
                  />
                ))}
                {/* Recently completed, newest first */}
                {recentDone.slice(0, 6).map((job, i) => (
                  <DownloadRow
                    key={job.id}
                    job={job}
                    index={activeJobs.length + i}
                    onCancel={() => cancel(job.id)}
                    onRetry={() => retry(job.id)}
                  />
                ))}
              </div>
            </AnimatePresence>
          </motion.section>
        )}

        {/* ── Library ───────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <HardDrive className="w-4 h-4 text-[var(--text-muted)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {query.trim() ? `Results (${filteredTracks.length})` : 'Your library'}
            </p>
          </div>

          {loadingLocal && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-3xl" />
              ))}
            </div>
          )}

          {!loadingLocal && localCount === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 gap-4"
            >
              <div className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
                <FolderOpen className="w-9 h-9 text-[var(--text-muted)]" />
              </div>
              <div className="text-center">
                <p className="font-bold text-[var(--text-primary)] text-lg">No local music found</p>
                <p className="text-[var(--text-muted)] text-sm mt-1 max-w-xs">
                  Add music files to your configured directories, or download tracks from search
                </p>
              </div>
            </motion.div>
          )}

          {!loadingLocal && localCount > 0 && filteredTracks.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 gap-3"
            >
              <Music2 className="w-9 h-9 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">
                No tracks match “{query.trim()}”
              </p>
            </motion.div>
          )}

          {!loadingLocal && filteredTracks.length > 0 && (
            <>
              {/* Storage info bar */}
              <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                <HardDrive className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                <span className="text-xs text-[var(--text-secondary)]">
                  {localCount} {localCount === 1 ? 'track' : 'tracks'} in local library
                  {downloadedCount > 0 && ` · ${downloadedCount} available offline`}
                </span>
              </div>
              <div className="space-y-1">
                {filteredTracks.map((track, i) => (
                  <LibraryTrackRow key={track.id} track={track} index={i} />
                ))}
              </div>
            </>
          )}
        </section>
      </ScrollArea>
    </div>
  )
}