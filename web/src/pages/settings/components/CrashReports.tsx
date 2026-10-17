import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Bug, CloudArrowUp, Trash, Warning, CheckCircle } from '@phosphor-icons/react'
import { api } from '@/api/client.api'
import { qk } from '@/lib/queryKeys'
import { useAuthStore } from '@/store/auth.store'
import {
   flushCrashes,
   getLocalCrashReports,
   type CrashReport
} from '@/lib/crashReporter'
import { SettingsGroup, SettingsRow, type ActionState } from './SettingsPrimitives'
import { cn } from '@/lib/utils'

/**
 * Crash reports.
 *
 * Two lists, because they answer different questions:
 *
 *  - **On this device** — everything captured and not yet delivered. This is
 *    the list that matters on a phone, where the crash often *is* a network
 *    problem: a report can sit here until the app is online again.
 *  - **On the server** — what the instance has collected, grouped by
 *    fingerprint. Reading it back is instance administration, so it only
 *    appears for an admin; a non-admin sees the local list and the "send"
 *    action, which is all they need to contribute a report.
 */

interface ServerReport {
   fingerprint: string
   kind: string
   message: string
   appVersion?: string
   platform?: string
   count?: number
   firstSeen?: string
   lastSeen?: string
}

function when(iso?: string): string {
   if (!iso) return '—'
   const then = Date.parse(iso)
   if (Number.isNaN(then)) return '—'
   const mins = Math.floor((Date.now() - then) / 60_000)
   if (mins < 1) return 'just now'
   if (mins < 60) return `${mins} min ago`
   const hours = Math.floor(mins / 60)
   if (hours < 24) return `${hours} h ago`
   return `${Math.floor(hours / 24)} d ago`
}

export default function CrashReports() {
   const isAuthenticated = useAuthStore(s => s.isAuthenticated)
   const queryClient = useQueryClient()
   const [local, setLocal] = useState<CrashReport[]>([])
   const [sendState, setSendState] = useState<ActionState>('idle')
   const [clearState, setClearState] = useState<ActionState>('idle')

   const refreshLocal = useCallback(() => setLocal(getLocalCrashReports()), [])
   useEffect(() => { refreshLocal() }, [refreshLocal])

   const { data, isLoading } = useQuery({
      queryKey: qk.crashReports(),
      enabled: isAuthenticated,
      // A failing backend must not throw the user onto the error page — this
      // screen exists to describe failure, so it handles it inline.
      queryFn: () => api.get<{ reports: ServerReport[] }>('/diagnostics/crash', { _noFatalRedirect: true }),
      retry: false
   })

   const reports = data?.reports ?? []

   const send = useCallback(async () => {
      setSendState('loading')
      try {
         await flushCrashes()
         refreshLocal()
         setSendState(getLocalCrashReports().length === 0 ? 'ok' : 'err')
      } catch {
         setSendState('err')
      }
   }, [refreshLocal])

   const clearServer = useCallback(async () => {
      setClearState('loading')
      try {
         await api.delete('/diagnostics/crash', { _noFatalRedirect: true })
         await queryClient.invalidateQueries({ queryKey: qk.crashReports() })
         setClearState('ok')
      } catch {
         setClearState('err')
      }
   }, [queryClient])

   return (
      <SettingsGroup
         title='Crash reports'
         footer='Reports are sent to your own server — no third-party crash service ever sees them. A report carries the error, the platform and the app version; never your account, your library or your listening history.'>
         <SettingsRow
            label='Waiting to send'
            description={
               local.length === 0
                  ? 'Everything captured has been delivered'
                  : `${local.length} report${local.length === 1 ? '' : 's'} captured on this device`
            }
            icon={<Bug className='w-[14px] h-[14px]' />}
            iconBg={local.length > 0 ? 'var(--warning)' : 'var(--text-muted)'}>
            <span className='text-[14px] text-[var(--text-muted)] tabular-nums'>{local.length}</span>
         </SettingsRow>

         <SettingsRow
            label='Send now'
            description='Retry delivery of anything still queued here'
            onClick={() => void send()}
            icon={<CloudArrowUp className='w-[14px] h-[14px]' />}
            iconBg='#0EA5E9'>
            {sendState === 'loading' ? (
               <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                  <CloudArrowUp className='w-4 h-4 text-[var(--text-muted)]' />
               </motion.span>
            ) : sendState === 'ok' ? (
               <CheckCircle className='w-4 h-4 text-[var(--success-text)]' />
            ) : sendState === 'err' ? (
               <Warning className='w-4 h-4 text-[var(--danger-text)]' />
            ) : null}
         </SettingsRow>

         {local.slice(-5).reverse().map(report => (
            <SettingsRow
               key={report.id}
               label={report.message}
               description={`${report.kind} · ${report.appVersion} · ${when(report.occurredAt)}`}
               icon={<Bug className='w-[14px] h-[14px]' />}
               iconBg='var(--warning)'
            />
         ))}

         {isAuthenticated && (
            <SettingsRow
               label='Clear stored reports'
               description='Delete every report this server has collected'
               onClick={() => void clearServer()}
               icon={<Trash className='w-[14px] h-[14px]' />}
               iconBg='var(--danger)'>
               {clearState === 'loading' ? (
                  <span className='text-[12px] text-[var(--text-muted)]'>clearing…</span>
               ) : clearState === 'ok' ? (
                  <CheckCircle className='w-4 h-4 text-[var(--success-text)]' />
               ) : clearState === 'err' ? (
                  <Warning className='w-4 h-4 text-[var(--danger-text)]' />
               ) : null}
            </SettingsRow>
         )}

         {isAuthenticated && isLoading && (
            <SettingsRow label='Loading server reports…' description='' icon={<Bug className='w-[14px] h-[14px]' />} />
         )}

         {isAuthenticated && reports.map(report => (
            <SettingsRow
               key={report.fingerprint}
               label={report.message || 'Unknown error'}
               description={cn(
                  report.kind,
                  '·',
                  report.appVersion ?? '?',
                  '·',
                  `seen ${report.count ?? 1}×`,
                  '·',
                  `last ${when(report.lastSeen)}`
               )}
               icon={<Warning className='w-[14px] h-[14px]' />}
               iconBg='var(--danger)'
            />
         ))}

         {isAuthenticated && !isLoading && reports.length === 0 && local.length === 0 && (
            <SettingsRow
               label='No crashes recorded'
               description='Nothing has been reported from any build yet'
               icon={<CheckCircle className='w-[14px] h-[14px]' />}
               iconBg='var(--success)'
            />
         )}
      </SettingsGroup>
   )
}
