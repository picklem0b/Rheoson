import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CaretDown, CaretRight, WarningCircle, CheckCircle, Warning, Copy, FolderOpen, ArrowClockwise, Scan, Trash, SpinnerGap } from '@phosphor-icons/react'
import { api } from '@/api/client.api'
import { cn } from '@/lib/utils'
import {
   SettingsGroup,
   type ActionState
} from '../components/SettingsPrimitives'

/**
 * Interactive Books Doctor.
 *
 * One "Scan library" action drives everything: a progress phase while the
 * server walks every music directory, then grouped findings (corrupt
 * files, duplicates, empty folders) where each row can be repaired
 * individually or swept as a group. Corrupt and duplicate sweeps show a
 * confirm step first — they delete files, so the count and the freed
 * space are shown before anything happens.
 */

// ── Types (mirror of the backend service shape) ──────────────

interface FileEntry {
   path: string
   name: string
   size: number
   mtime: number
   ext: string
   kind?: string | null
   note?: string | null
   keep?: string
   keepPath?: string
}

interface ScanResult {
   scanned: number
   totalBytes: number
   corrupt: FileEntry[]
   duplicates: FileEntry[]
   emptyDirs: string[]
   dirs: string[]
   scannedAt: string
}

// ── Helpers ──────────────────────────────────────────────────

function fmtBytes(n: number): string {
   if (!n || n <= 0) return '0 B'
   const units = ['B', 'KB', 'MB', 'GB']
   let value = n
   let i = 0
   while (value >= 1024 && i < units.length - 1) {
      value /= 1024
      i += 1
   }
   return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtDir(dir: string): string {
   const parts = dir.split('/').filter(Boolean)
   return parts.slice(-2).join('/') || dir
}

// ── State machine ────────────────────────────────────────────

type Phase = 'idle' | 'scanning' | 'done' | 'error'

export default function LibraryDoctor() {
   const [phase, setPhase] = useState<Phase>('idle')
   const [scan, setScan] = useState<ScanResult | null>(null)
   const [error, setError] = useState<string | null>(null)
   const [expanded, setExpanded] = useState<
      'corrupt' | 'duplicates' | 'emptyDirs' | null
   >(null)
   const [itemState, setItemState] = useState<Record<string, ActionState>>({})
   const [sweepState, setSweepState] = useState<
      Record<'corrupt' | 'duplicates' | 'emptyDirs', ActionState>
   >({ corrupt: 'idle', duplicates: 'idle', emptyDirs: 'idle' })
   const [confirming, setConfirming] = useState<
      'corrupt' | 'duplicates' | 'emptyDirs' | null
   >(null)
   const [progressTick, setProgressTick] = useState(0)
   const mounted = useRef(true)

   useEffect(() => {
      mounted.current = true
      return () => {
         mounted.current = false
      }
   }, [])

   // The scan is a single blocking request, so elapsed time is shown
   // while it runs rather than a fake percentage.
   useEffect(() => {
      if (phase !== 'scanning') return
      const t = setInterval(() => setProgressTick(v => v + 1), 500)
      return () => clearInterval(t)
   }, [phase])

   const scanStart = useRef(0)

   const runScan = useCallback(async () => {
      setPhase('scanning')
      setError(null)
      setScan(null)
      setExpanded(null)
      setConfirming(null)
      scanStart.current = Date.now()
      try {
         const res = await api.get<ScanResult>('/settings/doctor/scan')
         if (!mounted.current) return
         setScan(res)
         setPhase('done')
         // Auto-expand the first group that actually has findings.
         if (res.corrupt.length) setExpanded('corrupt')
         else if (res.duplicates.length) setExpanded('duplicates')
         else if (res.emptyDirs.length) setExpanded('emptyDirs')
      } catch (e) {
         if (!mounted.current) return
         setError(e instanceof Error ? e.message : 'Scan failed')
         setPhase('error')
      }
   }, [])

   /** Re-scan silently so counts/shrink reflect the repair immediately. */
   const refreshAfterFix = useCallback(async () => {
      try {
         const res = await api.get<ScanResult>('/settings/doctor/scan')
         if (!mounted.current) return
         setScan(res)
      } catch {
         // Keep showing the previous numbers; the next scan will catch up.
      }
   }, [])

   const fixOne = useCallback(
      async (key: string, kind: 'corrupt' | 'duplicate' | 'empty-dir', path: string) => {
         setItemState(s => ({ ...s, [key]: 'loading' }))
         try {
            await api.post('/settings/doctor/fix', { kind, path })
            if (!mounted.current) return
            setItemState(s => ({ ...s, [key]: 'ok' }))
            await refreshAfterFix()
         } catch {
            if (!mounted.current) return
            setItemState(s => ({ ...s, [key]: 'err' }))
         }
         setTimeout(() => {
            if (mounted.current) setItemState(s => ({ ...s, [key]: 'idle' }))
         }, 2500)
      },
      [refreshAfterFix]
   )

   const sweep = useCallback(
      async (group: 'corrupt' | 'duplicates' | 'emptyDirs') => {
         const kindMap = {
            corrupt: 'corrupt',
            duplicates: 'duplicate',
            emptyDirs: 'empty-dirs'
         } as const
         setSweepState(s => ({ ...s, [group]: 'loading' }))
         try {
            await api.post('/settings/doctor/fix', {
               kind: group === 'emptyDirs' ? 'empty-dirs' : kindMap[group]
            })
            if (!mounted.current) return
            setSweepState(s => ({ ...s, [group]: 'ok' }))
            setConfirming(null)
            await refreshAfterFix()
         } catch {
            if (!mounted.current) return
            setSweepState(s => ({ ...s, [group]: 'err' }))
         }
         setTimeout(() => {
            if (mounted.current)
               setSweepState(s => ({ ...s, [group]: 'idle' }))
         }, 2500)
      },
      [refreshAfterFix]
   )

   const groups = scan
      ? [
         {
            id: 'corrupt' as const,
            title: 'Corrupt files',
            icon: WarningCircle,
            tint: 'text-red-400',
            items: scan.corrupt,
            freed: scan.corrupt.reduce((a, f) => a + f.size, 0),
            sweepKind: 'corrupt' as const,
            danger: true
         },
         {
            id: 'duplicates' as const,
            title: 'Duplicate tracks',
            icon: Copy,
            tint: 'text-amber-400',
            items: scan.duplicates,
            freed: scan.duplicates.reduce((a, f) => a + f.size, 0),
            sweepKind: 'duplicates' as const,
            danger: true
         },
         {
            id: 'emptyDirs' as const,
            title: 'Empty folders',
            icon: FolderOpen,
            tint: 'text-[var(--text-secondary)]',
            items: scan.emptyDirs.map(d => ({
               path: d,
               name: fmtDir(d),
               size: 0,
               mtime: 0,
               ext: '',
               kind: null,
               note: null
            })) as FileEntry[],
            freed: 0,
            sweepKind: 'emptyDirs' as const,
            danger: false
         }
      ].filter(g => g.items.length > 0)
      : []

   const elapsed = Math.max(1, Math.round((Date.now() - scanStart.current) / 1000))
   void progressTick // re-render for elapsed

   const totalProblems = groups.reduce((a, g) => a + g.items.length, 0)

   return (
      <SettingsGroup
         title='Books doctor'
         footer='Scans every music folder for files that cannot play, copies of the same track, and leftover folders. Nothing is touched until you choose a repair.'>
         {/* ── Scan launcher / summary ─────────────────── */}
         <div className='px-4 py-4'>
            {phase === 'idle' && (
               <button
                  onClick={() => void runScan()}
                  className='w-full flex items-center gap-3 px-4 py-3.5 rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] transition-colors text-left'>
                  <div className='w-[38px] h-[38px] rounded-[10px] bg-[var(--accent)]/15 flex items-center justify-center flex-shrink-0'>
                     <Scan className='w-[18px] h-[18px] text-[var(--accent)]' />
                  </div>
                  <div className='min-w-0 flex-1'>
                     <p className='text-[15px] font-semibold text-[var(--text-primary)]'>
                        Scan library
                     </p>
                     <p className='text-[12.5px] text-[var(--text-muted)] mt-0.5'>
                        Find files that cannot play, duplicates and empty folders
                     </p>
                  </div>
                  <CaretRight className='w-4 h-4 text-[var(--text-muted)]' />
               </button>
            )}

            {phase === 'scanning' && (
               <div className='flex items-center gap-3 px-4 py-3.5 rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)]'>
                  <div className='w-[38px] h-[38px] rounded-[10px] bg-[var(--accent)]/15 flex items-center justify-center flex-shrink-0'>
                     <SpinnerGap className='w-[18px] h-[18px] text-[var(--accent)] animate-spin' />
                  </div>
                  <div className='min-w-0 flex-1'>
                     <p className='text-[15px] font-semibold text-[var(--text-primary)]'>
                        Scanning your library…
                     </p>
                     <p className='text-[12.5px] text-[var(--text-muted)] mt-0.5'>
                        Walking every music folder · {elapsed}s
                     </p>
                  </div>
               </div>
            )}

            {phase === 'error' && (
               <button
                  onClick={() => void runScan()}
                  className='w-full flex items-center gap-3 px-4 py-3.5 rounded-[14px] border border-red-400/25 bg-red-400/10 text-left'>
                  <Warning className='w-[18px] h-[18px] text-red-400 flex-shrink-0' />
                  <div className='min-w-0 flex-1'>
                     <p className='text-[14px] font-semibold text-[var(--text-primary)]'>
                        Scan failed
                     </p>
                     <p className='text-[12.5px] text-[var(--text-muted)] mt-0.5 truncate'>
                        {error} — tap to retry
                     </p>
                  </div>
                  <ArrowClockwise className='w-4 h-4 text-[var(--text-muted)]' />
               </button>
            )}

            {phase === 'done' && scan && (
               <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className='space-y-3'>
                  <div
                     className={cn(
                        'flex items-center gap-3 px-4 py-3.5 rounded-[14px] border',
                        totalProblems === 0
                           ? 'border-emerald-400/25 bg-emerald-400/10'
                           : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                     )}>
                     <div
                        className={cn(
                           'w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0',
                           totalProblems === 0 ? 'bg-emerald-400/15' : 'bg-[var(--accent)]/15'
                        )}>
                        {totalProblems === 0 ? (
                           <CheckCircle className='w-[18px] h-[18px] text-emerald-400' />
                        ) : (
                           <Scan className='w-[18px] h-[18px] text-[var(--accent)]' />
                        )}
                     </div>
                     <div className='min-w-0 flex-1'>
                        <p className='text-[15px] font-semibold text-[var(--text-primary)]'>
                           {totalProblems === 0
                              ? 'Books is clean'
                              : `${totalProblems} thing${totalProblems === 1 ? '' : 's'} found`}
                        </p>
                        <p className='text-[12.5px] text-[var(--text-muted)] mt-0.5'>
                           {scan.scanned} audio file{scan.scanned === 1 ? '' : 's'} ·{' '}
                           {fmtBytes(scan.totalBytes)} checked
                        </p>
                     </div>
                     <button
                        onClick={() => void runScan()}
                        aria-label='Scan again'
                        className='p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors'>
                        <ArrowClockwise className='w-4 h-4' />
                     </button>
                  </div>

                  {/* ── Finding groups ─────────────────────── */}
                  {groups.map(group => {
                     const isOpen = expanded === group.id
                     const Icon = group.icon
                     return (
                        <div
                           key={group.id}
                           className='rounded-[14px] border border-[var(--border)] overflow-hidden'>
                           <button
                              onClick={() => setExpanded(isOpen ? null : group.id)}
                              className='w-full flex items-center gap-3 px-4 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] transition-colors text-left'>
                              <Icon className={cn('w-4 h-4 flex-shrink-0', group.tint)} />
                              <p className='text-[14px] font-semibold text-[var(--text-primary)] flex-1'>
                                 {group.title}
                                 <span className='ml-2 text-[var(--text-muted)] font-normal'>
                                    {group.items.length}
                                 </span>
                              </p>
                              {group.danger && (
                                 <span className='text-[11px] text-[var(--text-muted)]'>
                                    {fmtBytes(group.freed)} recoverable
                                 </span>
                              )}
                              {isOpen ? (
                                 <CaretDown className='w-4 h-4 text-[var(--text-muted)]' />
                              ) : (
                                 <CaretRight className='w-4 h-4 text-[var(--text-muted)]' />
                              )}
                           </button>

                           <AnimatePresence initial={false}>
                              {isOpen && (
                                 <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className='overflow-hidden'>
                                    <div className='divide-y divide-[var(--border)] border-t border-[var(--border)]'>
                                       {group.items.map(item => {
                                          const isDir = group.id === 'emptyDirs'
                                          const key = item.path
                                          const st = itemState[key] ?? 'idle'
                                          return (
                                             <div
                                                key={key}
                                                className='flex items-center gap-3 px-4 py-3'>
                                                <div className='min-w-0 flex-1'>
                                                   <p className='text-[13.5px] font-medium text-[var(--text-primary)] truncate'>
                                                      {item.name}
                                                   </p>
                                                   <p className='text-[12px] text-[var(--text-muted)] mt-0.5 truncate'>
                                                      {isDir
                                                         ? item.path
                                                         : group.id === 'duplicates'
                                                           ? `${fmtBytes(item.size)} · keeping “${item.keep}”`
                                                           : `${fmtBytes(item.size)} · ${item.note ?? 'unreadable'}`}
                                                   </p>
                                                </div>
                                                <button
                                                   onClick={() =>
                                                      void fixOne(
                                                         key,
                                                         isDir
                                                            ? 'empty-dir'
                                                            : group.id === 'duplicates'
                                                              ? 'duplicate'
                                                              : 'corrupt',
                                                         item.path
                                                      )
                                                   }
                                                   disabled={st === 'loading' || st === 'ok'}
                                                   aria-label={
                                                      st === 'ok' ? 'Repaired' : 'Delete'
                                                   }
                                                   className={cn(
                                                      'p-2 rounded-full border transition-colors flex-shrink-0',
                                                      st === 'ok'
                                                         ? 'border-emerald-400/30 text-emerald-400'
                                                         : st === 'err'
                                                           ? 'border-red-400/30 text-red-400'
                                                           : 'border-[var(--border)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/30'
                                                   )}>
                                                   {st === 'loading' ? (
                                                      <SpinnerGap className='w-3.5 h-3.5 animate-spin' />
                                                   ) : st === 'ok' ? (
                                                      <CheckCircle className='w-3.5 h-3.5' />
                                                   ) : st === 'err' ? (
                                                      <Warning className='w-3.5 h-3.5' />
                                                   ) : (
                                                      <Trash className='w-3.5 h-3.5' />
                                                   )}
                                                </button>
                                             </div>
                                          )
                                       })}
                                    </div>

                                    {/* Sweep control with confirm step */}
                                    <div className='px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-elevated)]'>
                                       {confirming === group.id ? (
                                          <div className='flex items-center gap-2'>
                                             <button
                                                onClick={() => setConfirming(null)}
                                                className='flex-1 px-3 py-2 rounded-full text-[12.5px] font-semibold border border-[var(--border)] text-[var(--text-secondary)]'>
                                                Cancel
                                             </button>
                                             <button
                                                onClick={() => void sweep(group.id)}
                                                disabled={sweepState[group.id] === 'loading'}
                                                className={cn(
                                                   'flex-1 px-3 py-2 rounded-full text-[12.5px] font-bold flex items-center justify-center gap-1.5',
                                                   group.danger
                                                      ? 'bg-red-500/90 text-white'
                                                      : 'bg-[var(--accent)] text-white'
                                                )}>
                                                {sweepState[group.id] === 'loading' ? (
                                                   <SpinnerGap className='w-3.5 h-3.5 animate-spin' />
                                                ) : null}
                                                {group.danger
                                                   ? `Delete ${group.items.length} & free ${fmtBytes(group.freed)}`
                                                   : `Remove ${group.items.length} folders`}
                                             </button>
                                          </div>
                                       ) : (
                                          <button
                                             onClick={() => setConfirming(group.id)}
                                             disabled={
                                                sweepState[group.id] === 'ok' ||
                                                sweepState[group.id] === 'loading'
                                             }
                                             className='w-full px-3 py-2 rounded-full text-[12.5px] font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5'>
                                             {sweepState[group.id] === 'ok' ? (
                                                <>
                                                   <CheckCircle className='w-3.5 h-3.5 text-emerald-400' />
                                                   Cleared
                                                </>
                                             ) : sweepState[group.id] === 'err' ? (
                                                <>
                                                   <Warning className='w-3.5 h-3.5 text-red-400' />
                                                   Failed — try again
                                                </>
                                             ) : (
                                                `Fix all ${group.items.length}`
                                             )}
                                          </button>
                                       )}
                                    </div>
                                 </motion.div>
                              )}
                           </AnimatePresence>
                        </div>
                     )
                  })}
               </motion.div>
            )}
         </div>
      </SettingsGroup>
   )
}
