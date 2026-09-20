import { DownloadSimple, Lightning, ArrowClockwise } from '@phosphor-icons/react';
import { usePersisted } from "@/hooks/persisted.hook";
import { playChime } from "@/lib/sounds";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   RadioGroup
} from "../components/SettingsPrimitives";
import { useState } from "react";
import { useToast } from "@/components/ui/Toaster";

/**
 * Notification & sound settings.
 *
 * Only the two toggles with real consumers are offered: the UI chime gate
 * (lib/sounds.ts) and the download-complete chime gate (hooks/downloads.hook.ts).
 * The old section exposed five more toggles for system notifications that the
 * app has no code to post — removing them is honest, not a downgrade. If/when
 * the Android layer posts real notifications, that plumbing belongs behind a
 * MediaSession-style integration, not fake switches here.
 */
export default function NotificationsSection() {
   const [dlDone, setDlDone] = usePersisted("notif-dl-done", true);
   const [sound, setSound] = usePersisted("notif-sound", true);
   const [volume, setVolume] = usePersisted("chime-volume", 0.6);
   const [testing, setTesting] = useState(false);
   const { toast } = useToast();

   return (
      <div className='pb-4'>
         <SettingsGroup
            title='Sounds'
            footer='Sound effects play through the main audio output. Adjust device volume to control them.'>
            <SettingsRow
               label='Sound effects'
               description='Play a chime for feedback and download completion'
               icon={<Lightning className='w-[14px] h-[14px]' />}
               iconBg='var(--warning)'>
               <Toggle value={sound} onChange={setSound} />
            </SettingsRow>
            <RadioGroup
               value={String(volume) as "0.3" | "0.6" | "1"}
               onChange={v => setVolume(Number(v))}
               options={[
                  { value: "0.3", label: "Quiet", sub: "A subtle tap — 30% volume" },
                  { value: "0.6", label: "Medium", sub: "Default — 60% volume" },
                  { value: "1", label: "Loud", sub: "Full volume — hard to miss" }
               ]}
            />
            <SettingsRow
               label={testing ? 'Playing…' : 'Test sound effect'}
               description='Preview the chime at the chosen volume'
               icon={testing ? <ArrowClockwise className='w-[14px] h-[14px] animate-spin' /> : <Lightning className='w-[14px] h-[14px]' />}
               iconBg='var(--text-muted)'
               onClick={() => {
                  setTesting(true);
                  playChime(volume, true);
                  toast(`Chime at ${Math.round(volume * 100)}%`, 'info', 1600);
                  window.setTimeout(() => setTesting(false), 900);
               }}>
            </SettingsRow>
         </SettingsGroup>

         <SettingsGroup
            title='Downloads'
            footer='Lock-screen playback controls come from the system Media Session — see your device notification shade while playing.'>
            <SettingsRow
               label='DownloadSimple complete chime'
               description='Play the chime when a track finishes downloading'
               icon={<DownloadSimple className='w-[14px] h-[14px]' />}
               iconBg='var(--success)'>
               <Toggle value={dlDone} onChange={setDlDone} />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
