import {
   SettingsGroup,
   SettingsRow,
   Toggle
} from "../components/SettingsPrimitives";
import { usePersisted } from "@/hooks/persisted.hook";

/**
 * Streaming — what the app fetches over the network on its own.
 * The offline cache that stores streamed audio lives in Data & offline.
 */
export default function StreamingSection() {
   const [autoplay, setAutoplay] = usePersisted("autoplay", true);
   const [autoWarm, setAutoWarm] = usePersisted("storage-auto-warm", true);

   return (
      <div className='pb-4'>
         <SettingsGroup
            title='Streaming'
            footer='These controls decide what the app fetches on its own. Turning them off saves data at the cost of slower starts.'>
            <SettingsRow
               label='Autoplay'
               description='When your queue ends, keep playing similar music'>
               <Toggle value={autoplay} onChange={setAutoplay} />
            </SettingsRow>
            <SettingsRow
               label='Warm-ahead pre-buffer'
               description='Fetch upcoming tracks in the background while listening'>
               <Toggle value={autoWarm} onChange={setAutoWarm} />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
