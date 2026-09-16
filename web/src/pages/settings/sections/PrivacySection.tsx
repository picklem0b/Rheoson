import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
   Trash2,
   CheckCircle2,
   AlertCircle,
   RefreshCw,
   ExternalLink,
   Download,
   Upload
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
   const [backupState, setBackupState] = useState<ActionState>("idle");
   const [restoreState, setRestoreState] = useState<ActionState>("idle");
   const [restoreSummary, setRestoreSummary] = useState<string | null>(null);
   const fileRef = useRef<HTMLInputElement>(null);
   const queryClient = useQueryClient();

   const clearPlay = actionRunner(setClearPlayState, () =>
      api.delete("/tracks/history")
   );

   /**
    * Export likes, hidden tracks, history, playlists and follows as one file.
    *
    * On a phone the Web Share sheet is used so the file can go straight to
    * Drive or Files; on desktop it falls back to a normal download. Both are
    * the same bytes.
    */
   const exportBackup = actionRunner(setBackupState, async () => {
      const bundle = await api.get<Record<string, unknown>>("/settings/backup");
      const name = `rheoson-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([JSON.stringify(bundle, null, 2)], name, {
         type: "application/json"
      });

      const nav = navigator as Navigator & {
         canShare?: (data: ShareData) => boolean;
      };
      if (nav.share && nav.canShare?.({ files: [file] })) {
         await nav.share({ files: [file], title: name });
         return;
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
   });

   const importBackup = async (file: File) => {
      setRestoreState("loading");
      setRestoreSummary(null);
      try {
         const parsed = JSON.parse(await file.text());
         const res = await api.post<{
            liked: number;
            disliked: number;
            history: number;
            playlists: number;
            follows: number;
         }>("/settings/restore", { ...parsed, merge: true });

         setRestoreSummary(
            `${res.liked} liked · ${res.history} history · ${res.playlists} playlists · ${res.follows} follows`
         );
         setRestoreState("ok");
         // Every list in the app is derived from what was just replaced.
         queryClient.invalidateQueries();
      } catch {
         setRestoreState("err");
      }
      setTimeout(() => setRestoreState("idle"), 3000);
   };

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
            title='Backup & restore'
            footer='Likes, hidden tracks, play history, playlists and followed artists — the state that cannot be rebuilt by re-scanning your music. Restoring merges by default, so it never deletes anything you have done since your last export.'>
            <SettingsRow
               label={
                  backupState === "ok"
                     ? "Backup saved"
                     : backupState === "err"
                       ? "Export failed — try again"
                       : "Export backup"
               }
               description='Save everything to one file you can keep or move to another device'
               onClick={backupState === "idle" ? exportBackup : undefined}
               loading={backupState === "loading"}>
               {backupState === "loading" && (
                  <RefreshCw className='w-4 h-4 text-[var(--accent)] animate-spin' />
               )}
               {backupState === "ok" && (
                  <CheckCircle2 className='w-4 h-4 text-green-400' />
               )}
               {backupState === "err" && (
                  <AlertCircle className='w-4 h-4 text-red-400' />
               )}
               {backupState === "idle" && (
                  <Download className='w-4 h-4 text-[var(--text-muted)]/50' />
               )}
            </SettingsRow>

            <SettingsRow
               label={
                  restoreState === "ok"
                     ? "Backup restored"
                     : restoreState === "err"
                       ? "That file could not be read"
                       : "Restore from backup"
               }
               description={
                  restoreSummary ??
                  'Merge a previously exported file back into this library'
               }
               onClick={
                  restoreState === "idle" ? () => fileRef.current?.click() : undefined
               }
               loading={restoreState === "loading"}>
               {restoreState === "loading" && (
                  <RefreshCw className='w-4 h-4 text-[var(--accent)] animate-spin' />
               )}
               {restoreState === "ok" && (
                  <CheckCircle2 className='w-4 h-4 text-green-400' />
               )}
               {restoreState === "err" && (
                  <AlertCircle className='w-4 h-4 text-red-400' />
               )}
               {restoreState === "idle" && (
                  <Upload className='w-4 h-4 text-[var(--text-muted)]/50' />
               )}
            </SettingsRow>

            <input
               ref={fileRef}
               type='file'
               accept='application/json,.json'
               className='hidden'
               onChange={e => {
                  const f = e.target.files?.[0];
                  // Reset so choosing the same file twice still fires change.
                  e.target.value = "";
                  if (f) importBackup(f);
               }}
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
