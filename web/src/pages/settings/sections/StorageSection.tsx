import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FolderOpen, ArrowClockwise, DownloadSimple, Trash, CheckCircle, WarningCircle, MusicNotes, CaretDown, CaretRight, HardDrive } from '@phosphor-icons/react';
import { api } from "@/api/client.api";
import {
   getAudioCacheStats,
   clearAudioCache,
   pruneAudioCache
} from "@/lib/audioCache";
import { usePersisted } from "@/hooks/persisted.hook";
import { useQueryClient } from "@tanstack/react-query";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   ActionState,
   actionRunner
} from "../components/SettingsPrimitives";

interface Dir {
   path: string;
   active: boolean;
   exists?: boolean;
}
interface AudioFile {
   name: string;
   path: string;
   size: number;
   ext: string;
}

const DEFAULT_DIRS: Dir[] = [
   { path: "/data/data/com.termux/files/home/Rheoson/music", active: true },
   { path: "/storage/emulated/0/Music", active: true },
   { path: "/storage/emulated/0/DownloadSimple", active: false }
];

function fmt(bytes: number) {
   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StorageSection() {
   const queryClient = useQueryClient();
   const [dirs, setDirs] = usePersisted<Dir[]>("music-dirs", DEFAULT_DIRS);
   const [autoWarm, setAutoWarm] = usePersisted("storage-auto-warm", true);
   const [adding, setAdding] = useState(false);
   const [pathInput, setPathInput] = useState("");
   const [preview, setPreview] = useState<Record<string, AudioFile[]>>({});
   const [expanded, setExpanded] = useState<string | null>(null);
   const [loadingPreview, setLoadingPreview] = useState<string | null>(null);

   const [rescanState, setRescanState] = useState<ActionState>("idle");
   const [exportState, setExportState] = useState<ActionState>("idle");
   const [streamState, setStreamState] = useState<ActionState>("idle");
   const [artworkState, setArtworkState] = useState<ActionState>("idle");
   const [audioState, setAudioState] = useState<ActionState>("idle");

   // Client-side offline audio cache (see lib/audioCache)
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

   // Load server-side dirs on mount and merge with persisted state
   useEffect(() => {
      api.get<{
         directories: { path: string; exists: boolean; active: boolean }[];
      }>("/settings/directories")
         .then(r => {
            const merged = r.directories.map(d => {
               const persisted = dirs.find(x => x.path === d.path);
               return {
                  path: d.path,
                  active: persisted?.active ?? d.active,
                  exists: d.exists
               };
            });
            // Add any locally-added dirs not on the server
            const serverPaths = new Set(r.directories.map(d => d.path));
            const local = dirs.filter(d => !serverPaths.has(d.path));
            setDirs([...merged, ...local]);
         })
         .catch(() => {});
   }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only: dirs is the initial value

   // Keep the server's directory config in sync on structural changes
   // (add/remove). Active toggles only affect the next rescan.
   const syncDirs = (list: Dir[]) => {
      api
         .post("/settings/directories", { dirs: list.map(d => d.path) })
         .catch(() => {});
   };

   const addDir = () => {
      const trimmed = pathInput.trim();
      if (!trimmed || dirs.some(d => d.path === trimmed)) return;
      const next = [...dirs, { path: trimmed, active: true }];
      setDirs(next);
      syncDirs(next);
      setPathInput("");
      setAdding(false);
   };

   const removeDir = (path: string) => {
      if (dirs.length <= 1) return; // server requires at least one directory
      const next = dirs.filter(d => d.path !== path);
      setDirs(next);
      syncDirs(next);
   };
   const toggleDir = (index: number, active: boolean) =>
      setDirs(dirs.map((d, i) => (i === index ? { ...d, active } : d)));

   // Browse a directory to preview its audio files
   const browseDir = async (path: string) => {
      if (expanded === path) {
         setExpanded(null);
         return;
      }
      setExpanded(path);
      if (preview[path]) return;
      setLoadingPreview(path);
      try {
         const r = await api.get<{ files: AudioFile[] }>(
            `/settings/directories/browse?path=${encodeURIComponent(path)}`
         );
         setPreview(p => ({ ...p, [path]: r.files }));
      } catch {
         setPreview(p => ({ ...p, [path]: [] }));
      }
      setLoadingPreview(null);
   };

   const rescan = actionRunner(setRescanState, async () => {
      const activePaths = dirs.filter(d => d.active).map(d => d.path);
      await api.post("/settings/rescan", { dirs: activePaths });
      // Also persist the dir list to the server
      await api.post("/settings/directories", { dirs: dirs.map(d => d.path) });
   });

   const exportLib = actionRunner(setExportState, async () => {
      const data = await api.get<unknown>("/tracks/");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
         type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
         href: url,
         download: `rheoson-library-${new Date().toISOString().slice(0, 10)}.json`
      });
      a.click();
      URL.revokeObjectURL(url);
   });

   const clearStream = actionRunner(setStreamState, () =>
      api.post("/stream/cache/clear")
   );
   const clearArtwork = actionRunner(setArtworkState, () =>
      api.post("/stream/artwork/cache/clear")
   );

   return (
      <div className='pb-4'>
         {/* Music directories */}
         <SettingsGroup
            title='Music directories'
            footer='Active directories are scanned during a library rescan. Tap a directory to preview its contents.'>
            {dirs.map((d, i) => (
               <div
                  key={d.path}
                  className='border-b border-[var(--border)]/50 last:border-0'>
                  {/* Dir row */}
                  <div className='flex items-center gap-3 px-4 py-3'>
                     <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => browseDir(d.path)}
                        className='min-w-0 flex-1 text-left flex items-center gap-2'>
                        {expanded === d.path ? (
                           <CaretDown className='w-4 h-4 text-[var(--accent)] flex-shrink-0' />
                        ) : (
                           <CaretRight className='w-4 h-4 text-[var(--text-muted)]/40 flex-shrink-0' />
                        )}
                        <div className='min-w-0'>
                           <p className='text-[15px] font-[440] text-[var(--text-primary)] truncate leading-snug'>
                              {d.path.split("/").pop() || d.path}
                           </p>
                           <p className='text-[12px] text-[var(--text-muted)] truncate mt-[1px] font-mono'>
                              {d.path}
                           </p>
                           {d.exists === false && (
                              <p className='text-[11px] text-orange-400 mt-[2px]'>
                                 Directory not found on device
                              </p>
                           )}
                        </div>
                     </motion.button>
                     <div className='flex items-center gap-2 flex-shrink-0'>
                        <Toggle
                           value={d.active}
                           onChange={v => toggleDir(i, v)}
                        />
                        <motion.button
                           whileTap={{ scale: 0.82 }}
                           onClick={() => removeDir(d.path)}
                           className='w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors'>
                           <Trash className='w-3.5 h-3.5' />
                        </motion.button>
                     </div>
                  </div>

                  {/* Preview panel */}
                  <AnimatePresence>
                     {expanded === d.path && (
                        <motion.div
                           initial={{ height: 0, opacity: 0 }}
                           animate={{ height: "auto", opacity: 1 }}
                           exit={{ height: 0, opacity: 0 }}
                           transition={{
                              type: "spring",
                              damping: 26,
                              stiffness: 300
                           }}
                           className='overflow-hidden bg-[var(--bg-elevated)]/50'>
                           {loadingPreview === d.path ? (
                              <div className='px-6 py-4 flex items-center gap-2 text-[13px] text-[var(--text-muted)]'>
                                 <ArrowClockwise className='w-3.5 h-3.5 animate-spin' />{" "}
                                 Scanning…
                              </div>
                           ) : (preview[d.path] ?? []).length === 0 ? (
                              <p className='px-6 py-4 text-[13px] text-[var(--text-muted)]'>
                                 No audio files found in this directory.
                              </p>
                           ) : (
                              <div className='max-h-[220px] overflow-y-auto'>
                                 {(preview[d.path] ?? []).map(f => (
                                    <div
                                       key={f.path}
                                       className='flex items-center gap-3 px-6 py-2 border-t border-[var(--border)]/30'>
                                       <MusicNotes className='w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0' />
                                       <p className='text-[13px] text-[var(--text-primary)] truncate flex-1 font-[440]'>
                                          {f.name}
                                       </p>
                                       <span className='text-[11px] text-[var(--text-muted)] flex-shrink-0 font-mono uppercase'>
                                          {f.ext}
                                       </span>
                                       <span className='text-[11px] text-[var(--text-muted)] flex-shrink-0 tabular-nums'>
                                          {fmt(f.size)}
                                       </span>
                                    </div>
                                 ))}
                                 <p className='px-6 py-2 text-[11px] text-[var(--text-muted)] border-t border-[var(--border)]/30'>
                                    {preview[d.path]?.length ?? 0} audio files ·
                                    rescan to index them
                                 </p>
                              </div>
                           )}
                        </motion.div>
                     )}
                  </AnimatePresence>
               </div>
            ))}

            {/* Add dir form */}
            <AnimatePresence>
               {adding && (
                  <motion.div
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: "auto", opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     transition={{
                        type: "spring",
                        damping: 26,
                        stiffness: 300
                     }}
                     className='overflow-hidden border-t border-[var(--border)]/50'>
                     <div className='px-4 py-3 flex gap-2'>
                        <input
                           autoFocus
                           value={pathInput}
                           onChange={e => setPathInput(e.target.value)}
                           onKeyDown={e => e.key === "Enter" && addDir()}
                           placeholder='/storage/emulated/0/Music'
                           className='flex-1 h-10 px-3 text-[13px] font-mono rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 outline-none focus:border-[var(--accent)] transition-colors'
                        />
                        <button
                           onClick={addDir}
                           className='px-4 h-10 rounded-2xl bg-[var(--accent)] text-white text-[13px] font-semibold'>
                           Add
                        </button>
                        <button
                           onClick={() => setAdding(false)}
                           className='px-4 h-10 rounded-2xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-[13px]'>
                           Cancel
                        </button>
                     </div>
                  </motion.div>
               )}
            </AnimatePresence>

            <SettingsRow
               label='Add directory'
               description={dirs.length <= 1 ? 'The last directory can\u2019t be removed — the server needs at least one' : 'Add a folder path to scan for music files'}
               onClick={() => setAdding(!adding)}
               icon={<FolderOpen className='w-[14px] h-[14px]' />}
               iconBg='#F97316'
            />
         </SettingsGroup>

         {/* Books */}
         <SettingsGroup title='Books'>
            <StateRow
               state={rescanState}
               idleLabel='Rescan library'
               idleDesc='Re-index all active directories and update track metadata'
               okLabel='Books rescanned'
               errLabel='Rescan failed'
               onClick={rescanState === "idle" ? rescan : undefined}
               idleIcon={
                  <ArrowClockwise className='w-4 h-4 text-[var(--text-muted)]/40' />
               }
            />
            <StateRow
               state={exportState}
               idleLabel='Export library'
               idleDesc='DownloadSimple your full track library as a JSON file'
               okLabel='Books exported'
               errLabel='Export failed'
               onClick={exportState === "idle" ? exportLib : undefined}
               idleIcon={
                  <DownloadSimple className='w-4 h-4 text-[var(--text-muted)]/40' />
               }
            />
            <SettingsRow
               label='Refresh library view'
               description='Refetch every library list on this device from the server'
               onClick={() => {
                  queryClient.invalidateQueries();
               }}
               icon={<ArrowClockwise className='w-[14px] h-[14px]' />}
               iconBg='#0EA5E9'
            />
         </SettingsGroup>

         {/* Caching behaviour */}
         <SettingsGroup
            title='Caching behaviour'
            footer='Warm-ahead pre-buffers tracks you are about to hear so skips are instant. Turning it off saves data at the cost of slower skips.'>
            <SettingsRow
               label='Warm-ahead pre-buffer'
               description='Fetch upcoming tracks in the background while listening'>
               <Toggle value={autoWarm} onChange={setAutoWarm} />
            </SettingsRow>
         </SettingsGroup>

         {/* Cache */}
         <SettingsGroup
            title='Cache'
            footer='Clearing caches does not remove downloaded music — only temporary buffered segments.'>
            <StateRow
               state={streamState}
               idleLabel='Clear stream cache'
               idleDesc='Remove buffered audio segments from disk'
               okLabel='Stream cache cleared'
               errLabel='Failed to clear'
               onClick={streamState === "idle" ? clearStream : undefined}
               idleIcon={<Trash className='w-4 h-4 text-red-400' />}
               danger
            />
            <StateRow
               state={artworkState}
               idleLabel='Clear artwork cache'
               idleDesc='Re-fetch album art on next playback'
               okLabel='Artwork cache cleared'
               errLabel='Failed to clear'
               onClick={artworkState === "idle" ? clearArtwork : undefined}
               idleIcon={<Trash className='w-4 h-4 text-red-400' />}
               danger
            />
         </SettingsGroup>

         {/* Offline audio cache */}
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
               idleIcon={<Trash className='w-4 h-4 text-red-400' />}
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
         {state === "ok" && <CheckCircle className='w-4 h-4 text-green-400' />}
         {state === "err" && <WarningCircle className='w-4 h-4 text-red-400' />}
         {state === "idle" && idleIcon}
      </SettingsRow>
   );
}
