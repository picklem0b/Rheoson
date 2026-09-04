import { useState } from "react";
import {
   Trash2,
   CheckCircle2,
   AlertCircle,
   RefreshCw,
   ExternalLink
} from "lucide-react";
import { api } from "@/api/client.api";
import { usePersisted } from "@/hooks/persisted.hook";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   ActionState,
   actionRunner
} from "../components/SettingsPrimitives";

const GITHUB = "https://github.com/picklem0b/Rheoson/blob/main/docs";

export default function PrivacySection() {
   const [history, setHistory] = usePersisted("save-history", true);
   const [searchLog, setSearchLog] = usePersisted("save-search-log", true);

   const [clearPlayState, setClearPlayState] = useState<ActionState>("idle");
   const [clearSearchState, setClearSearchState] =
      useState<ActionState>("idle");

   const clearPlay = actionRunner(setClearPlayState, () =>
      api.delete("/tracks/history")
   );

   const clearSearch = actionRunner(setClearSearchState, async () => {
      sessionStorage.removeItem("rheoson-last-search");
      localStorage.removeItem("rheoson-search-history");
   });

   return (
      <div className='pb-4'>
         <SettingsGroup
            title='History'
            footer='Play history is stored on the server. Search history is stored only on this device.'>
            <SettingsRow
               label='Save play history'
               description='Off stops recording new recently-played entries (existing history stays until you clear it)'>
               <Toggle value={history} onChange={setHistory} />
            </SettingsRow>
            <SettingsRow
               label='Save search history'
               description='Off stops saving new searches and stops restoring your last search'>
               <Toggle value={searchLog} onChange={setSearchLog} />
            </SettingsRow>
         </SettingsGroup>

         <SettingsGroup title='Clear history'>
            <HistoryRow
               state={clearPlayState}
               idleLabel='Clear play history'
               idleDesc='Permanently remove all recently played tracks from the server'
               okLabel='Play history cleared'
               onClick={clearPlayState === "idle" ? clearPlay : undefined}
            />
            <HistoryRow
               state={clearSearchState}
               idleLabel='Clear search history'
               idleDesc='Remove saved search queries from this device'
               okLabel='Search history cleared'
               onClick={clearSearchState === "idle" ? clearSearch : undefined}
            />
         </SettingsGroup>

         <SettingsGroup
            title='Data'
            footer='Rheoson sends no analytics and no crash reports — nothing leaves your device or server. These toggles are reserved for future use.'>
            <SettingsRow
               label='Anonymous analytics'
               description='Reserved — not implemented. No usage data is currently sent.'>
               <Toggle value={false} onChange={() => {}} disabled />
            </SettingsRow>
            <SettingsRow
               label='Crash reports'
               description='Reserved — not implemented. No crash logs are currently sent.'>
               <Toggle value={false} onChange={() => {}} disabled />
            </SettingsRow>
         </SettingsGroup>

         <SettingsGroup title='Legal'>
            <SettingsRow
               label='Privacy policy'
               onClick={() => window.open(`${GITHUB}/PRIVACY.md`, "_blank")}>
               <ExternalLink className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Terms of service'
               onClick={() => window.open(`${GITHUB}/TERMS.md`, "_blank")}>
               <ExternalLink className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Open source licences'
               onClick={() =>
                  window.open(
                     "https://github.com/picklem0b/Rheoson/blob/main/LICENSE",
                     "_blank"
                  )
               }>
               <ExternalLink className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}

function HistoryRow({
   state,
   idleLabel,
   idleDesc,
   okLabel,
   onClick
}: {
   state: ActionState;
   idleLabel: string;
   idleDesc: string;
   okLabel: string;
   onClick?: () => void;
}) {
   return (
      <SettingsRow
         label={
            state === "ok"
               ? okLabel
               : state === "err"
                 ? "Failed — try again"
                 : idleLabel
         }
         description={state === "idle" ? idleDesc : undefined}
         danger={state === "idle"}
         onClick={onClick}
         loading={state === "loading"}>
         {state === "loading" && (
            <RefreshCw className='w-4 h-4 text-[var(--accent)] animate-spin' />
         )}
         {state === "ok" && <CheckCircle2 className='w-4 h-4 text-green-400' />}
         {state === "err" && <AlertCircle className='w-4 h-4 text-red-400' />}
         {state === "idle" && <Trash2 className='w-4 h-4 text-red-400' />}
      </SettingsRow>
   );
}
