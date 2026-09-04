import { Bell, Download, Zap, Megaphone } from "lucide-react";
import { usePersisted } from "@/hooks/persisted.hook";
import { playChime } from "@/lib/sounds";
import {
   SettingsGroup,
   SettingsRow,
   Toggle
} from "../components/SettingsPrimitives";

export default function NotificationsSection() {
   const [dlDone, setDlDone] = usePersisted("notif-dl-done", true);
   const [dlFail, setDlFail] = usePersisted("notif-dl-fail", true);
   const [dlProgress, setDlProgress] = usePersisted("notif-dl-progress", false);
   const [sound, setSound] = usePersisted("notif-sound", true);
   const [playback, setPlayback] = usePersisted("notif-playback", true);
   const [queueEnd, setQueueEnd] = usePersisted("notif-queue-end", false);
   const [updates, setUpdates] = usePersisted("notif-updates", false);

   return (
      <div className='pb-4'>
         <SettingsGroup title='Downloads'>
            <SettingsRow
               label='Download complete'
               description='Notify when a track finishes downloading'
               icon={<Download className='w-[14px] h-[14px]' />}
               iconBg='#22C55E'>
               <Toggle value={dlDone} onChange={setDlDone} />
            </SettingsRow>
            <SettingsRow
               label='Download failed'
               description='Alert when a download encounters an error'
               icon={<Download className='w-[14px] h-[14px]' />}
               iconBg='#EF4444'>
               <Toggle value={dlFail} onChange={setDlFail} />
            </SettingsRow>
            <SettingsRow
               label='Download progress'
               description='Show live progress in the notification shade'
               icon={<Download className='w-[14px] h-[14px]' />}
               iconBg='#0EA5E9'>
               <Toggle value={dlProgress} onChange={setDlProgress} />
            </SettingsRow>
         </SettingsGroup>

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

         <SettingsGroup title='Playback'>
            <SettingsRow
               label='Now playing notification'
               description='Show track info and controls in the system notification shade'
               icon={<Bell className='w-[14px] h-[14px]' />}
               iconBg='#8B5CF6'>
               <Toggle value={playback} onChange={setPlayback} />
            </SettingsRow>
            <SettingsRow
               label='Queue finished'
               description='Notify when the play queue reaches the end'
               icon={<Bell className='w-[14px] h-[14px]' />}
               iconBg='#6B7280'>
               <Toggle value={queueEnd} onChange={setQueueEnd} />
            </SettingsRow>
         </SettingsGroup>

         <SettingsGroup title='App'>
            <SettingsRow
               label='Update available'
               description='Notify when a new version of Rheoson is available on GitHub'
               icon={<Megaphone className='w-[14px] h-[14px]' />}
               iconBg='#14B8A6'>
               <Toggle value={updates} onChange={setUpdates} />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
