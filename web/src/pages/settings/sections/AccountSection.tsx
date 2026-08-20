import { useState, useEffect } from "react";
import { Check, AlertCircle, ExternalLink, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/client.api";
import { useSpotifyCredentials } from "@/hooks/spotifyCredentials.hook";
import { SettingsGroup, SettingsRow } from "../components/SettingsPrimitives";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AccountSection() {
   const { clientId, clientSecret, hasCredentials, save, clear } =
      useSpotifyCredentials();
   const [editId, setEditId] = useState(clientId);
   const [editSecret, setEditSecret] = useState(clientSecret);
   const [showSecret, setShowSecret] = useState(false);
   const [saveState, setSaveState] = useState<SaveState>("idle");
   const [serverLinked, setServerLinked] = useState<boolean | null>(null);

   useEffect(() => {
      api.get<{ connected: boolean }>("/settings/spotify/status")
         .then(r => setServerLinked(r.connected))
         .catch(() => setServerLinked(null));
   }, [saveState === "saved"]);

   const handleSave = async () => {
      if (!editId.trim() || !editSecret.trim()) return;
      setSaveState("saving");
      try {
         await api.post("/settings/spotify", {
            clientId: editId.trim(),
            clientSecret: editSecret.trim()
         });
         save(editId.trim(), editSecret.trim());
         setSaveState("saved");
         setServerLinked(true);
         setTimeout(() => setSaveState("idle"), 3000);
      } catch {
         setSaveState("error");
         setTimeout(() => setSaveState("idle"), 3000);
      }
   };

   const handleClear = () => {
      clear();
      setEditId("");
      setEditSecret("");
      setServerLinked(false);
   };

   const spotifyOk = serverLinked ?? hasCredentials;

   return (
      <div className='pb-4'>
         {/* Profile */}
         <div className='mb-7 rounded-[20px] overflow-hidden border border-[var(--border)]/30 bg-[var(--bg-surface)]'>
            <div className='px-5 py-5 flex items-center gap-4'>
               <div
                  className='w-[64px] h-[64px] rounded-[18px] flex items-center justify-center text-[26px] font-black text-white shadow-lg flex-shrink-0'
                  style={{
                     background:
                        "linear-gradient(135deg, var(--accent), var(--accent-bright, var(--accent)))"
                  }}>
                  L
               </div>
               <div className='min-w-0'>
                  <p className='text-[20px] font-bold text-[var(--text-primary)] leading-tight'>
                     LethaboK
                  </p>
                  <p className='text-[14px] text-[var(--text-muted)]'>
                     picklem0b
                  </p>
                  <div className='flex items-center gap-1.5 mt-1.5'>
                     <div className='w-1.5 h-1.5 rounded-full bg-green-400' />
                     <span className='text-[12px] text-green-400 font-semibold'>
                        Self-hosted · Local
                     </span>
                  </div>
               </div>
            </div>
         </div>

         {/* Spotify */}
         <SettingsGroup
            title='Spotify credentials'
            footer='Used only for metadata, cover art, and link resolution. Shulker never streams from Spotify.'>
            {/* Status */}
            <div
               className={cn(
                  "flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium border-b border-[var(--border)]/50",
                  spotifyOk
                     ? "text-green-400 bg-green-500/5"
                     : "text-orange-400 bg-orange-500/5"
               )}>
               {spotifyOk ? (
                  <Check className='w-4 h-4 flex-shrink-0' />
               ) : (
                  <AlertCircle className='w-4 h-4 flex-shrink-0' />
               )}
               {spotifyOk
                  ? `Connected · ${(serverLinked ? clientId : editId).slice(0, 12) || "—"}…`
                  : "Not connected — add your credentials below"}
            </div>

            <div className='px-4 py-4 space-y-4'>
               {/* Client ID */}
               <div className='space-y-1.5'>
                  <label className='text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]'>
                     Client ID
                  </label>
                  <input
                     type='text'
                     value={editId}
                     onChange={e => setEditId(e.target.value)}
                     placeholder='c6081b467a154fd69ba432261b973cd5'
                     className='w-full h-11 px-3 text-[14px] font-mono rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[var(--accent)] transition-colors'
                  />
               </div>

               {/* Client Secret */}
               <div className='space-y-1.5'>
                  <label className='text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]'>
                     Client Secret
                  </label>
                  <div className='relative'>
                     <input
                        type={showSecret ? "text" : "password"}
                        value={editSecret}
                        onChange={e => setEditSecret(e.target.value)}
                        placeholder='82ec996a6dba4218965bfea6483bd9c5'
                        className='w-full h-11 px-3 pr-16 text-[14px] font-mono rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 outline-none focus:border-[var(--accent)] transition-colors'
                     />
                     <button
                        onClick={() => setShowSecret(!showSecret)}
                        className='absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors'>
                        {showSecret ? "Hide" : "Show"}
                     </button>
                  </div>
               </div>

               {/* Save button */}
               <div className='flex gap-2'>
                  <motion.button
                     whileTap={{ scale: 0.97 }}
                     onClick={handleSave}
                     disabled={
                        saveState === "saving" ||
                        !editId.trim() ||
                        !editSecret.trim()
                     }
                     className={cn(
                        "flex-1 h-11 rounded-2xl text-[14px] font-semibold transition-colors flex items-center justify-center gap-2",
                        saveState === "saved"
                           ? "bg-green-500 text-white"
                           : saveState === "error"
                             ? "bg-red-500   text-white"
                             : "bg-[var(--accent)] text-white disabled:opacity-40"
                     )}>
                     <AnimatePresence mode='wait' initial={false}>
                        <motion.span
                           key={saveState}
                           initial={{ opacity: 0, y: 5 }}
                           animate={{ opacity: 1, y: 0 }}
                           exit={{ opacity: 0, y: -5 }}
                           transition={{ duration: 0.12 }}
                           className='flex items-center gap-1.5'>
                           {saveState === "saving" && "Saving…"}
                           {saveState === "saved" && (
                              <>
                                 <Check className='w-4 h-4' /> Saved
                              </>
                           )}
                           {saveState === "error" && "Error — try again"}
                           {saveState === "idle" && "Save credentials"}
                        </motion.span>
                     </AnimatePresence>
                  </motion.button>
                  {hasCredentials && (
                     <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={handleClear}
                        className='px-4 h-11 rounded-2xl text-[14px] font-semibold bg-red-500/10 text-red-400'>
                        Disconnect
                     </motion.button>
                  )}
               </div>

               <SettingsRow
                  label='Get credentials'
                  description='developer.spotify.com/dashboard'
                  onClick={() =>
                     window.open(
                        "https://developer.spotify.com/dashboard",
                        "_blank"
                     )
                  }>
                  <ExternalLink className='w-4 h-4 text-[var(--text-muted)]/40' />
               </SettingsRow>
            </div>
         </SettingsGroup>

         {/* Danger */}
         <SettingsGroup title='Danger zone'>
            <SettingsRow
               label='Clear all app data'
               description='Wipes all settings, theme, history, playlists and credentials. Cannot be undone.'
               danger
               onClick={() => {
                  localStorage.clear();
                  window.location.reload();
               }}
               icon={<Trash2 className='w-[14px] h-[14px]' />}
               iconBg='#EF4444'
            />
         </SettingsGroup>
      </div>
   );
}
