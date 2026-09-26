import { useState, useEffect, useCallback } from 'react'
import { Trash, CheckCircle, WarningCircle, ArrowClockwise, DownloadSimple, HardDrive } from '@phosphor-icons/react'
import {
   SettingsGroup,
   SettingsRow,
   ActionState,
   actionRunner
} from "../components/SettingsPrimitives";
import {
   getAudioCacheStats,
   clearAudioCache,
   pruneAudioCache
} from "@/lib/audioCache";

function fmt(bytes: number) {
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Data & offline — the offline audio cache: what streamed audio this
 * device keeps, how much, and clearing it. The network-side behaviour
 * (autoplay, warm-ahead) lives in Streaming; downloads live in Downloads.
 */
export default function DataOfflineSection() {
   const [audioState, setAudioState] = useState<ActionState>("idle");
   const [audioStats, setAudioStats] = useState<{
      count: number;
      bytes: number;
      limitBytes: number;
   } | null>(null);
   const [cacheLimitMb, setCacheLimitMb] = useState(300);

   const refreshAudioStats = useCallback(() => {
      getAudioCacheStats()
         .then(setAudioStats)
         .catch(() => setAudioStats(null))
   }, []);

   useEffect(() => {
      try {
         const raw = localStorage.getItem('rheoson-audio-cache-limit-mb')
         if (raw !== null) setCacheLimitMb(Number(JSON.parse(raw)))
      } catch {
         /* keep the default */
      }
   }, [])

   // Stats are read on entry and after any clear, so the numbers reflect the
   // real store rather than a cached guess.
   useEffect(() => {
      let alive = true
      getAudioCacheStats()
         .then(s => { if (alive) setAudioStats(s) })
         .catch(() => {})
      return () => { alive = false }
   }, [audioState])

   const clearAudio = async () => {
      await actionRunner(setAudioState, async () => {
         await clearAudioCache()
         refreshAudioStats()
      })
   }

   return (
      <div className='pb-4'>
         <SettingsGroup
            title='Offline audio cache'
            footer='Tracks you have played are kept in the browser so replaying and skipping start instantly — and keep working with no connection. Downloaded music lives in your library and is never cleared here.'>
            <SettingsRow
               label='Cached for offline playback'
               description={
                  audioStats
                     ? `${audioStats.count} track${audioStats.count === 1 ? '' : 's'} · ${fmt(audioStats.bytes)} of ${fmt(audioStats.limitBytes)}`
                     : 'Measuring…'
               }
               icon={<DownloadSimple className='w-[14px] h-[14px]' />}
               iconBg='#0EA5E9'
            />

            <SettingsRow
               label='Cache size limit'
               description='How much audio to keep on this device (0 disables the cache)'
               icon={<HardDrive className='w-[14px] h-[14px]' />}
               iconBg='#8B5CF6'>
               <select
                  value={cacheLimitMb}
                  onChange={e => {
                     const mb = Number(e.target.value)
                     setCacheLimitMb(mb)
                     localStorage.setItem(
                        'rheoson-audio-cache-limit-mb',
                        JSON.stringify(mb)
                     )
                     pruneAudioCache().then(refreshAudioStats).catch(() => {})
                  }}
                  className='h-9 px-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
               >
                  {[0, 100, 300, 500, 1000].map(mb => (
                     <option key={mb} value={mb}>
                        {mb === 0 ? 'Off' : `${mb} MB`}
                     </option>
                  ))}
               </select>
            </SettingsRow>

            <StateRow
               state={audioState}
               idleLabel='Clear offline audio'
               idleDesc='Free the space used by cached tracks'
               okLabel='Offline audio cleared'
               errLabel='Failed to clear'
               onClick={audioState === "idle" ? clearAudio : undefined}
               idleIcon={<Trash className='w-4 h-4 text-[var(--danger-text)]' />}
               danger
            />
         </SettingsGroup>
      </div>
   );
}

// ── StateRow helper ───────────────────────────────────────────

function StateRow({
   state,
   idleLabel,
   idleDesc,
   okLabel,
   errLabel,
   onClick,
   idleIcon,
   danger
}: {
   state: ActionState;
   idleLabel: string;
   idleDesc?: string;
   okLabel: string;
   errLabel: string;
   onClick?: () => void;
   idleIcon: React.ReactNode;
   danger?: boolean;
}) {
   const label =
      state === "ok" ? okLabel : state === "err" ? errLabel : idleLabel;

   return (
      <SettingsRow
         label={label}
         description={state === "idle" ? idleDesc : undefined}
         danger={danger && state === "idle"}
         onClick={onClick}
         loading={state === "loading"}>
         {state === "loading" && (
            <ArrowClockwise className='w-4 h-4 text-[var(--accent)] animate-spin' />
         )}
         {state === "ok" && <CheckCircle className='w-4 h-4 text-[var(--success-text)]' />}
         {state === "err" && <WarningCircle className='w-4 h-4 text-[var(--danger-text)]' />}
         {state === "idle" && idleIcon}
      </SettingsRow>
   );
}
