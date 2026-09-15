import { Download, Zap } from "lucide-react";
import { usePersisted } from "@/hooks/persisted.hook";
import { playChime } from "@/lib/sounds";
import {
   SettingsGroup,
   SettingsRow,
   Toggle
} from "../components/SettingsPrimitives";

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

   return (
      <div className='pb-4'>
         <SettingsGroup
            title='Sounds'
            footer='Sound effects play through the main audio output. Adjust device volume to control them.'>
            <SettingsRow
               label='Sound effects'
               description='Play a chime for feedback and download completion'
               icon={<Zap className='w-[14px] h-[14px]' />}
               iconBg='#EAB308'>
               <Toggle value={sound} onChange={setSound} />
            </SettingsRow>
            <SettingsRow
               label='Test sound effect'
               description='Preview the chime at its current volume'
               icon={<Zap className='w-[14px] h-[14px]' />}
               iconBg='#A3A3A3'
               onClick={() => playChime(0.6, true)}>
            </SettingsRow>
         </SettingsGroup>

         <SettingsGroup
            title='Downloads'
            footer='Lock-screen playback controls come from the system Media Session — see your device notification shade while playing.'>
            <SettingsRow
               label='Download complete chime'
               description='Play the chime when a track finishes downloading'
               icon={<Download className='w-[14px] h-[14px]' />}
               iconBg='#22C55E'>
               <Toggle value={dlDone} onChange={setDlDone} />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
