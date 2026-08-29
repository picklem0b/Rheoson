import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePersisted } from "@/hooks/persisted.hook";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   RadioGroup,
   Slider,
   Stepper
} from "../components/SettingsPrimitives";

export default function DownloadsSection() {
   const [fmt, setFmt] = usePersisted<string>("dl-format", "mp3");
   const [quality, setQuality] = usePersisted<string>("dl-quality", "320");
   const [artwork, setArtwork] = usePersisted("dl-artwork", true);
   const [lyrics, setLyrics] = usePersisted("dl-lyrics", true);
   const [metadata, setMetadata] = usePersisted("dl-metadata", true);
   const [chapters, setChapters] = usePersisted("dl-chapters", false);
   const [wifiOnly, setWifi] = usePersisted("dl-wifi-only", false);
   const [autoRetry, setAutoRetry] = usePersisted("dl-auto-retry", true);
   const [retries, setRetries] = usePersisted("dl-retries", 3);
   const [maxConc, setMaxConc] = usePersisted("dl-concurrent", 3);
   const [speedCap, setSpeedCap] = usePersisted("dl-speed-cap", 0);
   const [naming, setNaming] = usePersisted<
      "title-artist" | "artist-title" | "id"
   >("dl-naming", "title-artist");
   const [customPath, setCustomPath] = usePersisted("dl-custom-path", "");

   const [editingPath, setEditingPath] = useState(false);
   const [pathInput, setPathInput] = useState(customPath);

   const saveCustomPath = () => {
      setCustomPath(pathInput.trim());
      setEditingPath(false);
   };

   return (
      <div className='pb-4'>
         {/* Format */}
         <SettingsGroup
            title='Default format'
            footer='MP3 is the most compatible. Opus is best quality-to-size. FLAC and WAV are lossless.'>
            <RadioGroup
               value={fmt as "mp3" | "opus" | "m4a" | "flac" | "wav"}
               onChange={setFmt}
               options={[
                  {
                     value: "mp3",
                     label: "MP3",
                     sub: "Universal — plays on every device"
                  },
                  {
                     value: "opus",
                     label: "Opus",
                     sub: "Best quality-to-size — modern codec"
                  },
                  {
                     value: "m4a",
                     label: "M4A",
                     sub: "AAC in MP4 container — Apple-native"
                  },
                  {
                     value: "flac",
                     label: "FLAC",
                     sub: "Lossless — larger files, perfect quality"
                  },
                  {
                     value: "wav",
                     label: "WAV",
                     sub: "Uncompressed — huge files, no encoding"
                  }
               ]}
            />
         </SettingsGroup>

         {/* Quality */}
         <SettingsGroup
            title='Download quality'
            footer='Only applies to lossy formats (MP3, Opus, M4A). FLAC and WAV are always lossless.'>
            <RadioGroup
               value={quality as "128" | "192" | "256" | "320"}
               onChange={setQuality}
               options={[
                  {
                     value: "128",
                     label: "128 kbps",
                     sub: "Small files — acceptable quality"
                  },
                  {
                     value: "192",
                     label: "192 kbps",
                     sub: "Good balance of quality and file size"
                  },
                  {
                     value: "256",
                     label: "256 kbps",
                     sub: "High quality — small difference vs 320"
                  },
                  {
                     value: "320",
                     label: "320 kbps",
                     sub: "Best MP3/AAC quality — recommended"
                  },
                  {
                     value: "best",
                     label: "Best available",
                     sub: "yt-dlp picks the highest quality stream"
                  }
               ]}
            />
         </SettingsGroup>

         {/* Metadata */}
         <SettingsGroup title='Embed in file'>
            <SettingsRow
               label='Album artwork'
               description='Save the cover image inside the downloaded file'>
               <Toggle value={artwork} onChange={setArtwork} />
            </SettingsRow>
            <SettingsRow
               label='Synced lyrics'
               description='Embed LRC-format lyrics inside the file'>
               <Toggle value={lyrics} onChange={setLyrics} />
            </SettingsRow>
            <SettingsRow
               label='Full metadata'
               description='Title, artist, album, year, genre, and track number'>
               <Toggle value={metadata} onChange={setMetadata} />
            </SettingsRow>
            <SettingsRow
               label='Split chapters'
               description='For long videos — create a separate file per chapter'>
               <Toggle value={chapters} onChange={setChapters} />
            </SettingsRow>
         </SettingsGroup>

         {/* File naming */}
         <SettingsGroup title='File naming'>
            <RadioGroup
               value={naming}
               onChange={setNaming}
               options={[
                  {
                     value: "title-artist",
                     label: "Title – Artist",
                     sub: "Blinding Lights – The Weeknd.mp3"
                  },
                  {
                     value: "artist-title",
                     label: "Artist – Title",
                     sub: "The Weeknd – Blinding Lights.mp3"
                  },
                  { value: "id", label: "Video ID", sub: "dQw4w9WgXcQ.mp3" }
               ]}
            />
         </SettingsGroup>

         {/* Save location */}
         <SettingsGroup title='Save location'>
            <SettingsRow
               label='Custom path'
               description={customPath || "Default Shulker music directory"}
               onClick={() => {
                  setPathInput(customPath);
                  setEditingPath(!editingPath);
               }}
            />
            <AnimatePresence>
               {editingPath && (
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
                           onKeyDown={e =>
                              e.key === "Enter" && saveCustomPath()
                           }
                           placeholder='/storage/emulated/0/Music'
                           className='flex-1 h-10 px-3 text-[13px] font-mono rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 outline-none focus:border-[var(--accent)] transition-colors'
                        />
                        <button
                           onClick={saveCustomPath}
                           className='px-4 h-10 rounded-2xl bg-[var(--accent)] text-white text-[13px] font-semibold'>
                           Save
                        </button>
                        <button
                           onClick={() => setEditingPath(false)}
                           className='px-4 h-10 rounded-2xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-[13px]'>
                           Cancel
                        </button>
                     </div>
                  </motion.div>
               )}
            </AnimatePresence>
         </SettingsGroup>

         {/* Behaviour */}
         <SettingsGroup title='Download behaviour'>
            <SettingsRow
               label='Wi-Fi only'
               description='Pause all downloads when on mobile data'>
               <Toggle value={wifiOnly} onChange={setWifi} />
            </SettingsRow>
            <SettingsRow
               label='Auto-retry on failure'
               description='Automatically retry failed downloads'>
               <Toggle value={autoRetry} onChange={setAutoRetry} />
            </SettingsRow>
            {autoRetry && (
               <SettingsRow
                  label='Max retries'
                  description='Attempts before giving up'>
                  <Stepper
                     value={retries}
                     onChange={setRetries}
                     min={1}
                     max={10}
                  />
               </SettingsRow>
            )}
            <SettingsRow
               label='Concurrent downloads'
               description='Tracks downloading simultaneously'>
               <Stepper value={maxConc} onChange={setMaxConc} min={1} max={8} />
            </SettingsRow>
         </SettingsGroup>

         {/* Speed limit */}
         <SettingsGroup
            title='Speed limit'
            footer={
               speedCap === 0
                  ? "No limit — downloads as fast as possible."
                  : `Capped at ${speedCap} KB/s`
            }>
            <Slider
               value={speedCap}
               onChange={setSpeedCap}
               min={0}
               max={5000}
               step={100}
               label='Max download speed'
               formatValue={v => (v === 0 ? "Unlimited" : `${v} KB/s`)}
            />
         </SettingsGroup>
      </div>
   );
}
