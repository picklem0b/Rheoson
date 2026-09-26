import { useState } from 'react'
import {
   SettingsGroup,
   SettingsRow,
   Toggle
} from "../components/SettingsPrimitives";
import { usePersisted } from "@/hooks/persisted.hook";
import { getPlaybackRate, setPlaybackRate } from '@/hooks/player.hook'
import { cn } from '@/lib/utils'

/**
 * Playback — queue-shaping and transport behaviour.
 *
 * The speed control here is the same engine switch the player's ••• sheet
 * uses (player.hook's setPlaybackRate): one source of truth, applied live
 * to the current Howl and re-applied on every later load.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

export default function PlaybackSection() {
   const [gapless, setGapless] = usePersisted("gapless", true);
   const [seekStep, setSeekStep] = usePersisted("seek-step", 10);
   const [hapticsOn, setHapticsOn] = usePersisted("haptics-enabled", true);
   const [speed, setSpeed] = useState(() => getPlaybackRate());

   const chooseSpeed = (v: number) => {
      setSpeed(v);
      setPlaybackRate(v);
   };

   return (
      <div className="space-y-6">
         <SettingsGroup
            title='Speed'
            footer='Applies instantly to the current track and stays for every track after it.'>
            <div className='px-4 py-4 flex flex-wrap gap-2'>
               {SPEEDS.map(v => (
                  <button
                     key={v}
                     onClick={() => chooseSpeed(v)}
                     aria-pressed={speed === v}
                     className={cn(
                        'px-3.5 py-1.5 rounded-full text-[13px] font-bold border transition-all duration-150 active:scale-95',
                        speed === v
                           ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                           : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--accent)]/50'
                     )}>
                     {v}×
                  </button>
               ))}
            </div>
         </SettingsGroup>

         <SettingsGroup title='Transport'>
            <SettingsRow
               label='Gapless playback'
               description='Start the next track the instant this one ends'>
               <Toggle value={gapless} onChange={setGapless} />
            </SettingsRow>
            <SettingsRow
               label='Seek step'
               description='How far double-tap skip jumps, in seconds'>
               <div className='flex items-center gap-1'>
                  {[5, 10, 15, 30].map(s => (
                     <button
                        key={s}
                        onClick={() => setSeekStep(s)}
                        aria-pressed={seekStep === s}
                        className={cn(
                           'w-9 h-8 rounded-lg text-xs font-bold border transition-colors',
                           seekStep === s
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)]'
                        )}>
                        {s}
                     </button>
                  ))}
               </div>
            </SettingsRow>
            <SettingsRow
               label='Haptics'
               description='Vibration feedback on player controls'>
               <Toggle value={hapticsOn} onChange={setHapticsOn} />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
