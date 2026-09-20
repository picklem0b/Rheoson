import { usePersisted } from "@/hooks/persisted.hook";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   RadioGroup,
   Stepper
} from "../components/SettingsPrimitives";

/**
 * DownloadSimple settings — only controls the download pipeline actually reads.
 * File naming, save location, and speed limits are decided by the backend
 * (MUSIC_DIR layout, yt-dlp), so those controls would be decoration.
 */
export default function DownloadsSection() {
   const [fmt, setFmt] = usePersisted<string>("dl-format", "mp3");
   const [quality, setQuality] = usePersisted<string>("dl-quality", "320");
   const [artwork, setArtwork] = usePersisted("dl-artwork", true);
   const [lyrics, setLyrics] = usePersisted("dl-lyrics", true);
   const [metadata, setMetadata] = usePersisted("dl-metadata", true);
   const [wifiOnly, setWifi] = usePersisted("dl-wifi-only", false);
   const [autoRetry, setAutoRetry] = usePersisted("dl-auto-retry", true);
   const [maxConc, setMaxConc] = usePersisted("dl-concurrent", 3);
   const [retries, setRetries] = usePersisted("dl-retries", 3);
   const [speedCap, setSpeedCap] = usePersisted("dl-speed-cap", 0);
   const [naming, setNaming] = usePersisted<string>("dl-naming", "artist-title");

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
            title='DownloadSimple quality'
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
         </SettingsGroup>

         {/* File naming / save location / speed caps are backend-decided
             (MUSIC_DIR + yt-dlp) and intentionally not configurable here. */}

         {/* Behaviour */}
         <SettingsGroup title='DownloadSimple behaviour'>
            <SettingsRow
               label='Wi-Fi only'
               description='Pause all downloads when on mobile data'>
               <Toggle value={wifiOnly} onChange={setWifi} />
            </SettingsRow>
            <SettingsRow
               label='Auto-retry on failure'
               description='Failed downloads are retried automatically with backoff'>
               <Toggle value={autoRetry} onChange={setAutoRetry} />
            </SettingsRow>
            <SettingsRow
               label='Retry attempts'
               description='How many times a failed download is retried (0 retries when auto-retry is off)'>
               <Stepper value={retries} onChange={setRetries} min={0} max={8} />
            </SettingsRow>
            <SettingsRow
               label='Concurrent downloads'
               description='Tracks downloading simultaneously'>
               <Stepper value={maxConc} onChange={setMaxConc} min={1} max={8} />
            </SettingsRow>
         </SettingsGroup>

         {/* Advanced — all read per-download by the pipeline */}
         <SettingsGroup
            title='Advanced'
            footer='Speed cap is in kilobytes per second (0 = unlimited). File naming decides the saved file name: artist first, title first, or the internal track ID.'>
            <SettingsRow
               label='Speed cap'
               description='Limit per-download bandwidth to be polite to your network'>
               <Stepper
                  value={speedCap}
                  onChange={setSpeedCap}
                  min={0}
                  max={4096}
               />
            </SettingsRow>
            <RadioGroup
               value={naming as "artist-title" | "title-artist" | "id"}
               onChange={setNaming}
               options={[
                  { value: "artist-title", label: 'Artist — Title', sub: 'Default — groups files by artist' },
                  { value: "title-artist", label: 'Title — Artist', sub: 'Alphabetical by song name' },
                  { value: "id", label: 'Track ID only', sub: 'Short internal ID — best for large libraries' }
               ]}
            />
         </SettingsGroup>
      </div>
   );
}
