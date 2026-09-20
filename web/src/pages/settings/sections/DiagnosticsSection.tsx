import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Warning, CheckCircle, CircleDashed, ArrowClockwise, Path, HardDrives, ShieldCheck, Stethoscope, WifiHigh, WifiSlash } from '@phosphor-icons/react'
import type { ApiTargetSource } from '@/lib/constants'
import { healthApi, type HealthPayload, type SelftestPayload } from '@/api/health.api'
import { api } from '@/api/client.api'
import { useAuthStore } from '@/store/auth.store'
import { isOnline, onStatusChange } from '@/lib/network'
import { isNativePlatform, isAndroid } from '@/lib/capacitor'
import {
   buildFindings,
   describeOverall,
   runtimeFacts,
   worstSeverity,
   type Finding,
   type Fix,
   type Severity
} from '@/lib/diagnostics'
import LibraryDoctor from '../components/LibraryDoctor'
import {
   SettingsGroup,
   SettingsRow,
   type ActionState
} from '../components/SettingsPrimitives'
import { cn } from '@/lib/utils'

/**
 * Doctor.
 *
 * Everything here already existed as a probe — the health endpoints answer
 * "is each subsystem healthy" in operator language. What was missing was the
 * step from that to "what do I do now": a screen that says, in plain words,
 * what is wrong, what it costs you, and the single action that fixes it.
 *
 * The snapshot endpoint is cheap (the server refreshes its probes in the
 * background), so this screen can poll it without being part of the problem.
 * The deep probe runs real work, so it is an explicit action and requires a
 * session.
 */

/**
 * Plain-language explanation of how the API address was chosen.
 *
 * A wrong address is indistinguishable from an outage once requests start
 * failing, and the fix is completely different in each case — so the Doctor
 * says which of the three legitimate configurations this build is in, and
 * flags the one that means "nobody configured it".
 */
const API_SOURCE_LABELS: Record<ApiTargetSource, string> = {
   'dev-proxy': 'Vite dev proxy — requests go to your local backend',
   env: 'Configured by VITE_API_URL at build time',
   'same-origin': 'Same origin as this page — reverse proxy in front',
   'canonical-fallback':
      'Not configured — using the built-in API host (set VITE_API_URL for a custom deployment)'
}

const SEVERITY: Record<
   Severity,
   { label: string; Icon: React.ElementType; color: string; bg: string; ring: string }
> = {
   ok: {
      label: 'Working',
      Icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/12',
      ring: 'border-emerald-400/25'
   },
   warn: {
      label: 'Degraded',
      Icon: Warning,
      color: 'text-amber-400',
      bg: 'bg-amber-400/12',
      ring: 'border-amber-400/25'
   },
   bad: {
      label: 'Problem',
      Icon: Warning,
      color: 'text-red-400',
      bg: 'bg-red-400/12',
      ring: 'border-red-400/25'
   },
   unknown: {
      label: 'Skipped',
      Icon: CircleDashed,
      color: 'text-[var(--text-muted)]',
      bg: 'bg-[var(--bg-overlay)]',
      ring: 'border-[var(--border)]'
   }
}

// ── Finding row ───────────────────────────────────────────────

function FindingRow({
   finding,
   state,
   onFix
}: {
   finding: Finding
   state: ActionState
   onFix: (fix: Fix) => void
}) {
   const style = SEVERITY[finding.severity]
   const Icon = style.Icon

   return (
      <div className='px-4 py-3.5'>
         <div className='flex items-start gap-3'>
            <div
               className={cn(
                  'w-[30px] h-[30px] rounded-[8px] flex items-center justify-center flex-shrink-0 border',
                  style.bg,
                  style.ring
               )}>
               <Icon className={cn('w-[16px] h-[16px]', style.color)} />
            </div>
            <div className='min-w-0 flex-1'>
               <div className='flex items-center gap-2'>
                  <p className='text-[15px] font-[440] text-[var(--text-primary)] leading-snug'>
                     {finding.title}
                  </p>
                  <span
                     className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                        style.bg,
                        style.color
                     )}>
                     {style.label}
                  </span>
               </div>
               {finding.detail && (
                  <p className='text-[13px] text-[var(--text-muted)] mt-[3px] leading-snug break-words'>
                     {finding.detail}
                  </p>
               )}
               {finding.impact && (
                  <p className='text-[12px] text-[var(--text-muted)]/80 mt-1.5 leading-relaxed'>
                     {finding.impact}
                  </p>
               )}

               {finding.fix && (
                  <motion.button
                     whileTap={{ scale: 0.97 }}
                     disabled={state === 'loading'}
                     onClick={() => finding.fix && onFix(finding.fix)}
                     className={cn(
                        'mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
                        state === 'ok'
                           ? 'border-emerald-400/30 text-emerald-400'
                           : state === 'err'
                             ? 'border-red-400/30 text-red-400'
                             : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
                        state === 'loading' && 'opacity-50'
                     )}>
                     {state === 'loading' && (
                        <ArrowClockwise className='w-3.5 h-3.5 animate-spin' />
                     )}
                     {state === 'ok' && <CheckCircle className='w-3.5 h-3.5' />}
                     {state === 'err' && <Warning className='w-3.5 h-3.5' />}
                     {state === 'ok'
                        ? 'Done'
                        : state === 'err'
                          ? 'Failed'
                          : finding.fix.label}
                  </motion.button>
               )}
            </div>
         </div>
      </div>
   )
}

// ── Section ───────────────────────────────────────────────────

export default function DiagnosticsSection() {
   const isAuthenticated = useAuthStore(s => s.isAuthenticated)

   const [deep, setDeep] = useState<HealthPayload | null>(null)
   const [selftest, setSelftest] = useState<SelftestPayload | null>(null)
   const [fixState, setFixState] = useState<Record<string, ActionState>>({})
   const [toolOutput, setToolOutput] = useState<string | null>(null)
   const [online, setOnline] = useState(isOnline())

   const { data, isLoading, isFetching, refetch, error } = useQuery({
      queryKey: ['health-snapshot'],
      queryFn: () => healthApi.snapshot(),
      // Matches the server's probe refresh interval — polling faster would
      // return the same cached numbers.
      refetchInterval: 60_000,
      retry: 1
   })

   useEffect(() => onStatusChange(setOnline), [])

   const payload = deep ?? data
   const findings = buildFindings(payload)
   const overall = worstSeverity(findings)
   const facts = runtimeFacts(payload)

   const setFix = useCallback((id: string, state: ActionState) => {
      setFixState(prev => ({ ...prev, [id]: state }))
      if (state === 'ok' || state === 'err') {
         window.setTimeout(
            () => setFixState(prev => ({ ...prev, [id]: 'idle' })),
            3000
         )
      }
   }, [])

   const runFix = useCallback(
      async (findingId: string, fix: Fix) => {
         setFix(findingId, 'loading')
         try {
            switch (fix.kind) {
               case 'recheck':
                  setDeep(null)
                  await refetch()
                  break
               case 'deep':
                  setDeep(await healthApi.deep())
                  break
               case 'selftest':
                  setSelftest(await healthApi.selftest())
                  break
               case 'rescan':
                  await api.post('/settings/rescan')
                  break
               case 'update-tools': {
                  const res = await api.post<{ ok: boolean; output: string }>(
                     '/settings/tools/update'
                  )
                  setToolOutput(res?.output ?? null)
                  if (!res?.ok) throw new Error('update failed')
                  break
               }
               case 'clear-stream-cache':
                  await api.post('/stream/cache/clear')
                  break
               case 'clear-remote-cache':
                  await api.post('/stream/remote-cache/clear')
                  break
               case 'open-storage':
                  window.dispatchEvent(
                     new CustomEvent('rheoson:settings-section', {
                        detail: 'storage'
                     })
                  )
                  break
            }
            setFix(findingId, 'ok')
         } catch {
            setFix(findingId, 'err')
         }
      },
      [refetch, setFix]
   )

   const overallStyle = SEVERITY[overall]

   return (
      <div>
         {/* ── Status banner ──────────────────────────────── */}
         <div
            className={cn(
               'mb-7 rounded-[18px] border p-4 flex items-center gap-3.5',
               overallStyle.bg,
               overallStyle.ring
            )}>
            <div className='w-[42px] h-[42px] rounded-[12px] bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0'>
               <Stethoscope className={cn('w-5 h-5', overallStyle.color)} />
            </div>
            <div className='min-w-0 flex-1'>
               <p className='text-[16px] font-semibold text-[var(--text-primary)] leading-snug'>
                  {error ? 'Cannot reach the server' : describeOverall(payload)}
               </p>
               <p className='text-[13px] text-[var(--text-muted)] mt-[2px] leading-snug'>
                  {error
                     ? 'The app keeps working for anything already on this device.'
                     : payload
                       ? `Checked just now · server up ${facts.uptime ?? '—'}`
                       : 'Running checks…'}
               </p>
            </div>
            <motion.button
               whileTap={{ scale: 0.94 }}
               disabled={isFetching}
               onClick={() => {
                  setDeep(null)
                  refetch()
               }}
               className='w-9 h-9 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0'>
               <ArrowClockwise
                  className={cn(
                     'w-4 h-4 text-[var(--text-primary)]',
                     (isFetching || isLoading) && 'animate-spin'
                  )}
               />
            </motion.button>
         </div>

         {/* ── Checks ─────────────────────────────────────── */}
         <SettingsGroup
            title='Checks'
            footer={
               isAuthenticated
                  ? 'The deep check re-probes every subsystem immediately, including database latency and tool versions.'
                  : 'Sign in to run a deep check that re-probes every subsystem immediately.'
            }>
            {isLoading && findings.length === 0 ? (
               <div className='px-4 py-6 space-y-3'>
                  {Array.from({ length: 4 }).map((_, i) => (
                     <div
                        key={i}
                        className='h-12 rounded-2xl bg-[var(--bg-elevated)] animate-pulse'
                     />
                  ))}
               </div>
            ) : findings.length === 0 ? (
               <SettingsRow
                  label='No checks reported'
                  description='The server answered without a diagnostics payload.'
                  icon={<Warning className='w-[14px] h-[14px]' />}
                  iconBg='var(--text-muted)'
               />
            ) : (
               findings.map(f => (
                  <FindingRow
                     key={f.id}
                     finding={f}
                     state={fixState[f.id] ?? 'idle'}
                     onFix={fix => runFix(f.id, fix)}
                  />
               ))
            )}

            {isAuthenticated && (
               <SettingsRow
                  label='Run deep check'
                  description='Force a fresh probe of every subsystem now'
                  onClick={() => runFix('__deep', { label: 'Run deep check', kind: 'deep' })}
                  icon={<ShieldCheck className='w-[14px] h-[14px]' />}
                  iconBg='#8B5CF6'>
                  {fixState['__deep'] === 'loading' ? (
                     <ArrowClockwise className='w-4 h-4 text-[var(--text-muted)] animate-spin' />
                  ) : fixState['__deep'] === 'ok' ? (
                     <CheckCircle className='w-4 h-4 text-emerald-400' />
                  ) : null}
               </SettingsRow>
            )}
         </SettingsGroup>

         {/* ── Path self-test ────────────────────────────── */}
         {isAuthenticated && (
            <SettingsGroup
               title='Path self-test'
               footer='Drives real, read-only requests through the server — search, library, streaming, downloads — so broken routes show up here instead of in your ears.'>
               <SettingsRow
                  label='Test the routes'
                  description={
                     selftest
                        ? `${selftest.summary.pass} passed · ${selftest.summary.fail} failed · ${selftest.summary.skipped} skipped · ${selftest.totalMs} ms`
                        : 'Send live probe requests through every major route'
                  }
                  onClick={() => runFix('__selftest', { label: 'Test routes', kind: 'selftest' })}
                  icon={<Path className='w-[14px] h-[14px]' />}
                  iconBg='#0EA5E9'>
                  {fixState['__selftest'] === 'loading' ? (
                     <ArrowClockwise className='w-4 h-4 text-[var(--text-muted)] animate-spin' />
                  ) : fixState['__selftest'] === 'ok' ? (
                     <CheckCircle className='w-4 h-4 text-emerald-400' />
                  ) : fixState['__selftest'] === 'err' ? (
                     <Warning className='w-4 h-4 text-red-400' />
                  ) : null}
               </SettingsRow>
               {selftest?.checks.map(c => {
                  const s = SEVERITY[c.status === 'pass' ? 'ok' : c.status === 'warn' ? 'warn' : c.status === 'fail' ? 'bad' : 'unknown']
                  const Icon = s.Icon
                  return (
                     <SettingsRow
                        key={c.name}
                        label={c.description}
                        description={c.detail || undefined}
                        icon={<Icon className='w-[14px] h-[14px]' />}
                        iconBg={c.status === 'pass' ? 'var(--success)' : c.status === 'warn' ? 'var(--warning)' : c.status === 'fail' ? 'var(--danger)' : 'var(--text-muted)'}>
                        <span className={cn('text-[12px] tabular-nums', s.color)}>
                           {c.latencyMs != null ? `${c.latencyMs} ms` : s.label}
                        </span>
                     </SettingsRow>
                  )
               })}
            </SettingsGroup>
         )}

         {/* yt-dlp self-update output */}
         {toolOutput && (
            <SettingsGroup title='Last tool update'>
               <div className='px-4 py-3.5'>
                  <pre className='text-[12px] leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap break-words font-mono'>
                     {toolOutput}
                  </pre>
               </div>
            </SettingsGroup>
         )}

         {/* ── HardDrive runtime ─────────────────────────────── */}
         <SettingsGroup
            title='HardDrive'
            footer='Request metrics for the last 60 seconds, as the server sees them.'>
            <SettingsRow
               label='API address'
               description={API_SOURCE_LABELS[facts.apiSource]}
               icon={<HardDrives className='w-[14px] h-[14px]' />}
               iconBg='#8B5CF6'>
               <span
                  className='max-w-[190px] truncate text-[13px] font-mono text-[var(--text-muted)]'
                  title={facts.apiBase}>
                  {facts.apiBase}
               </span>
            </SettingsRow>
            <SettingsRow
               label='Uptime'
               description='Since the API process last started'
               icon={<ArrowClockwise className='w-[14px] h-[14px]' />}
               iconBg='#0EA5E9'>
               <span className='text-[14px] text-[var(--text-muted)] tabular-nums'>
                  {facts.uptime ?? '—'}
               </span>
            </SettingsRow>
            <SettingsRow
               label='Response time'
               description='95th percentile over the last minute'
               icon={<Stethoscope className='w-[14px] h-[14px]' />}
               iconBg='#22C55E'>
               <span className='text-[14px] text-[var(--text-muted)] tabular-nums'>
                  {facts.p95 != null ? `${facts.p95} ms` : '—'}
               </span>
            </SettingsRow>
            <SettingsRow
               label='Recent errors'
               description='Failed requests kept by the server'
               icon={<Warning className='w-[14px] h-[14px]' />}
               iconBg={facts.errors ? 'var(--danger)' : 'var(--text-muted)'}>
               <span className='text-[14px] text-[var(--text-muted)] tabular-nums'>
                  {facts.errors ?? 0}
               </span>
            </SettingsRow>
         </SettingsGroup>

         {/* ── Library doctor ─────────────────────────────── */}
         <LibraryDoctor />

         {/* ── This device ────────────────────────────────── */}
         <SettingsGroup
            title='This device'
            footer='Local device state. Cache management lives in Storage.'>
            <SettingsRow
               label='Connection'
               description={
                  online
                     ? 'API reachable'
                     : 'Offline — only music already on this device will play'
               }
               icon={
                  online ? (
                     <WifiHigh className='w-[14px] h-[14px]' />
                  ) : (
                     <WifiSlash className='w-[14px] h-[14px]' />
                  )
               }
               iconBg={online ? 'var(--success)' : 'var(--danger)'}
            />
            <SettingsRow
               label='Platform'
               description={
                  isNativePlatform()
                     ? isAndroid()
                        ? 'Android app'
                        : 'Native app'
                     : 'Web browser'
               }
               icon={<CheckCircle className='w-[14px] h-[14px]' />}
               iconBg='#14B8A6'
            />
         </SettingsGroup>
      </div>
   )
}
