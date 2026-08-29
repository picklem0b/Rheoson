import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Download, HardDrive, Clock, FolderOpen } from 'lucide-react'
import { useDownloads } from '@/hooks/downloads.hook'
import { tracksApi } from '@/api/tracks.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import DownloadRow from './components/DownloadRow'
import LibraryTrackRow from './components/LibraryTrackRow'

type Tab = 'local' | 'downloaded' | 'activity'

export default function Downloads() {
  const { jobs, activeJobs, completedJobs, cancel, retry, clearDone } = useDownloads()
  const [tab, setTab] = useState<Tab>('local')

  // ── Local library tracks — from all music dirs on disk ──
  const { data: localTracks, isLoading: loadingLocal } = useQuery({
    queryKey:  ['tracks', 'all'],
    queryFn:   tracksApi.getAll,
    staleTime: 10_000,
  })

  // ── Downloaded tracks — filter local tracks with isDownloaded flag ──
  const downloadedTracks = localTracks?.filter(t => t.isDownloaded)
  const downloadedCount = downloadedTracks?.length ?? 0

  const localCount = localTracks?.length ?? 0

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-6 pb-4 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Music</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {localCount} tracks on this device
            </p>
          </div>
          {tab === 'activity' && completedJobs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearDone}>
              Clear done
            </Button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          {([
            { id: 'local' as const,      label: 'Local',      icon: FolderOpen, count: localCount },
            { id: 'downloaded' as const, label: 'Downloaded', icon: Download,   count: downloadedCount },
            { id: 'activity' as const,   label: 'Activity',   icon: Clock,      count: activeJobs.length },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 relative',
                tab === t.id
                  ? 'bg-[var(--text-primary)] text-[var(--bg-base)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]',
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.count > 0 && t.id === 'activity' && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] text-[9px] font-bold text-white flex items-center justify-center">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-6">

        {/* ── Local tab — all music files found on disk ─────── */}
        {tab === 'local' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="local"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
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
                  className="flex flex-col items-center justify-center py-24 gap-4"
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

              {!loadingLocal && localCount > 0 && (
                <>
                  {/* Storage info bar */}
                  <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                    <HardDrive className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                    <span className="text-xs text-[var(--text-secondary)]">
                      {localCount} {localCount === 1 ? 'track' : 'tracks'} in local library
                    </span>
                  </div>
                  <div className="space-y-1">
                    {localTracks!.map((track, i) => (
                      <LibraryTrackRow key={track.id} track={track} index={i} />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── Downloaded tab — tracks saved via download feature ── */}
        {tab === 'downloaded' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="downloaded"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {loadingLocal && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-3xl" />
                  ))}
                </div>
              )}

              {!loadingLocal && downloadedCount === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-24 gap-4"
                >
                  <div className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
                    <Download className="w-9 h-9 text-[var(--text-muted)]" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-[var(--text-primary)] text-lg">No downloads yet</p>
                    <p className="text-[var(--text-muted)] text-sm mt-1">Search for songs and save them for offline</p>
                  </div>
                </motion.div>
              )}

              {!loadingLocal && downloadedCount > 0 && (
                <div className="space-y-1">
                  {downloadedTracks!.map((track, i) => (
                    <LibraryTrackRow key={track.id} track={track} index={i} />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── Activity tab — in-flight + recent job history ────── */}
        {tab === 'activity' && (
          <AnimatePresence mode="popLayout">
            {jobs.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-24 gap-4"
              >
                <div className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
                  <Clock className="w-9 h-9 text-[var(--text-muted)]" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-[var(--text-primary)] text-lg">No activity</p>
                  <p className="text-[var(--text-muted)] text-sm mt-1">Downloads will appear here while in progress</p>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job, i) => (
                  <DownloadRow
                    key={job.id}
                    job={job}
                    index={i}
                    onCancel={() => cancel(job.id)}
                    onRetry={() => retry(job.id)}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}

      </ScrollArea>
    </div>
  )
}
