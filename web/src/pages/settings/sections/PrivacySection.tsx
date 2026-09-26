import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Trash, CheckCircle, WarningCircle, ArrowClockwise, ArrowSquareOut, DownloadSimple, Upload, CaretDown } from '@phosphor-icons/react';
import { api } from "@/api/client.api";
import { usePersisted } from "@/hooks/persisted.hook";
import { cn } from "@/lib/utils";
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
   const [signOutState, setSignOutState] = useState<ActionState>("idle");
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
      // The Search page also keeps its recent-queries dropdown here; clear it
      // too so "clear search history" is unambiguous.
      sessionStorage.removeItem("rheoson-recent-searches");
   });

   /** Sign out of the session on this device only — server data untouched.
    *  Distinct from "Clear all app data" (Account section), which wipes
    *  settings and libraries as well. */
   const signOutDevice = actionRunner(setSignOutState, async () => {
      localStorage.removeItem("rheoson-auth");
      sessionStorage.removeItem("rheoson-last-search");
      // Re-render everything that read the auth store at boot.
      window.location.reload();
   });

   return (
      <div className='pb-4'>
         <SettingsGroup
            title='ClockCounterClockwise'
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
                  <ArrowClockwise className='w-4 h-4 text-[var(--accent)] animate-spin' />
               )}
               {backupState === "ok" && (
                  <CheckCircle className='w-4 h-4 text-[var(--success-text)]' />
               )}
               {backupState === "err" && (
                  <WarningCircle className='w-4 h-4 text-[var(--danger-text)]' />
               )}
               {backupState === "idle" && (
                  <DownloadSimple className='w-4 h-4 text-[var(--text-muted)]/50' />
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
                  <ArrowClockwise className='w-4 h-4 text-[var(--accent)] animate-spin' />
               )}
               {restoreState === "ok" && (
                  <CheckCircle className='w-4 h-4 text-[var(--success-text)]' />
               )}
               {restoreState === "err" && (
                  <WarningCircle className='w-4 h-4 text-[var(--danger-text)]' />
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

         <SettingsGroup
            title='Session'
            footer='Sign out of this device only. Your account, likes, playlists and downloads on the server are untouched — signing back in restores everything.'>
            <SettingsRow
               label='Sign out of this device'
               description='Clears the session token from this device and reloads the app'
               danger
               onClick={signOutState === "idle" ? signOutDevice : undefined}
               icon={<ArrowClockwise className='w-[14px] h-[14px]' />}
               iconBg='var(--danger)'
            />
         </SettingsGroup>

         {/* Full documentation — the whole policy, in the app */}
         <PrivacyDocs />

         <SettingsGroup title='Legal'>
            <SettingsRow
               label='Privacy policy'
               onClick={() => window.open(`${GITHUB}/PRIVACY.md`, "_blank")}>
               <ArrowSquareOut className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Terms of service'
               onClick={() => window.open(`${GITHUB}/TERMS.md`, "_blank")}>
               <ArrowSquareOut className='w-4 h-4 text-[var(--text-muted)]/40' />
            </SettingsRow>
            <SettingsRow
               label='Open source licences'
               onClick={() =>
                  window.open(
                     "https://github.com/picklem0b/Rheoson/blob/main/LICENSE",
                     "_blank"
                  )
               }>
               <ArrowSquareOut className='w-4 h-4 text-[var(--text-muted)]/40' />
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
            <ArrowClockwise className='w-4 h-4 text-[var(--accent)] animate-spin' />
         )}
         {state === "ok" && <CheckCircle className='w-4 h-4 text-[var(--success-text)]' />}
         {state === "err" && <WarningCircle className='w-4 h-4 text-[var(--danger-text)]' />}
         {state === "idle" && <Trash className='w-4 h-4 text-[var(--danger-text)]' />}
      </SettingsRow>
   );
}

/**
 * The full privacy documentation, rendered in the app — what data exists,
 * where it lives, who receives it, and how to remove it. Mirrors
 * docs/PRIVACY.md; this is the reader, the file is the source.
 */
function PrivacyDocs() {
   const [open, setOpen] = useState(false);
   const SECTIONS: { title: string; body: React.ReactNode }[] = [
      {
         title: 'What Rheoson collects',
         body: (
            <>
               <p>Rheoson is self-hosted: when you run your own instance, <b>you are the operator</b>. The software sends nothing to any central service run by the maintainer.</p>
               <p>What exists, and where it lives:</p>
               <ul>
                  <li><b>Account identity</b> — Clerk (third-party sign-in). Email and avatar you sign up with; Clerk&apos;s own policy governs it.</li>
                  <li><b>Likes, history, playlists, follows</b> — your server, keyed to your account, isolated per user.</li>
                  <li><b>Play signals &amp; listening stats</b> — your server&apos;s database, only if you configured one; powers recommendations.</li>
                  <li><b>Downloaded audio</b> — your server&apos;s library and your device storage.</li>
                  <li><b>Theme, layout, playback settings</b> — this device only. Never uploaded.</li>
               </ul>
            </>
         ),
      },
      {
         title: 'Who receives data',
         body: (
            <>
               <p>Requests leave your machine only when you search, stream, or fetch extras:</p>
               <ul>
                  <li><b>YouTube Music</b> — search terms and video IDs when you search or stream.</li>
                  <li><b>Spotify</b> — only when you paste a Spotify link; metadata only, no audio, no personal data.</li>
                  <li><b>Lyrics providers</b> — track title and artist for songs you play.</li>
                  <li><b>Clerk</b> — sign-in only.</li>
                  <li><b>Artwork CDNs</b> — image URLs, proxied server-side.</li>
               </ul>
               <p>None of these receive your likes, history, playlists, or any Rheoson-internal data.</p>
            </>
         ),
      },
      {
         title: 'What is logged',
         body: (
            <p>The server logs structured operational events: request IDs, routes, status codes, timing. <b>No tokens, no credentials, no request bodies.</b> Database connection strings are redacted. Retention is controlled by whoever operates the server — on your own instance, that is you.</p>
         ),
      },
      {
         title: 'How to remove your data',
         body: (
            <>
               <p>Everything on this page is actionable:</p>
               <ul>
                  <li><b>Play history</b> — clear it above (Clear play history).</li>
                  <li><b>Search logs</b> — clear them above, or turn saving off entirely.</li>
                  <li><b>Likes, playlists, follows</b> — export a backup, then delete them in the app.</li>
                  <li><b>Everything</b> — delete your account with Clerk; server-side data is keyed to that identity and can be purged by the operator.</li>
               </ul>
            </>
         ),
      },
      {
         title: 'Hosting for other people',
         body: (
            <p>If you host an instance for others, this policy describes the software&apos;s behaviour; you are responsible for your own privacy notice, log retention, and user data removal requests.</p>
         ),
      },
   ];

   return (
      <SettingsGroup
         title='How your data works'
         footer='The full documentation, not a summary.'>
         <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className='w-full flex items-center justify-between px-4 py-3.5 text-left'>
            <span className='text-[15px] font-medium text-[var(--text-primary)]'>
               Read the full privacy documentation
            </span>
            <CaretDown
               className={cn(
                  'w-4 h-4 text-[var(--text-muted)] transition-transform',
                  open && 'rotate-180',
               )}
            />
         </button>
         <AnimatePresence initial={false}>
            {open && (
               <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className='overflow-hidden'>
                  <div className='px-4 pb-4 space-y-5'>
                     {SECTIONS.map(s => (
                        <div key={s.title}>
                           <p className='text-[13px] font-bold text-[var(--text-primary)] mb-1.5'>{s.title}</p>
                           <div className='text-[13px] leading-relaxed text-[var(--text-secondary)] space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_b]:text-[var(--text-primary)]'>
                              {s.body}
                           </div>
                        </div>
                     ))}
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
      </SettingsGroup>
   );
}
