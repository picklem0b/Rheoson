import { useState } from 'react'
import { motion } from 'framer-motion'
import { SettingsGroup, SettingsRow, Toggle, RadioGroup } from '../components/SettingsPrimitives'

type AudioFormat  = 'mp3' | 'flac' | 'opus' | 'm4a' | 'wav'
type AudioQuality = '128' | '192' | '256' | '320' | 'best'

export default function DownloadsSection() {
  const [fmt,      setFmt]     = useState<AudioFormat>('mp3')
  const [quality,  setQuality] = useState<AudioQuality>('320')
  const [artwork,  setArtwork] = useState(true)
  const [lyrics,   setLyrics]  = useState(true)
  const [wifiOnly, setWifi]    = useState(false)
  const [maxConc,  setMaxConc] = useState(4)

  return (
    <div className="pb-2">
      <SettingsGroup title="Default format">
        <RadioGroup
          value={fmt}
          onChange={setFmt}
          options={[
            { value: 'mp3',  label: 'MP3',  sub: 'Universal — works everywhere'           },
            { value: 'flac', label: 'FLAC', sub: 'Lossless — largest file size'           },
            { value: 'opus', label: 'Opus', sub: 'Best quality/size ratio — modern'       },
            { value: 'm4a',  label: 'M4A',  sub: 'Apple format — AAC codec'               },
            { value: 'wav',  label: 'WAV',  sub: 'Uncompressed — huge files, max quality' },
          ]}
        />
      </SettingsGroup>

      <SettingsGroup title="Default quality">
        <RadioGroup
          value={quality}
          onChange={setQuality}
          options={[
            { value: '128',  label: '128 kbps',       sub: 'Small files, acceptable quality' },
            { value: '192',  label: '192 kbps',       sub: 'Good balance'                    },
            { value: '256',  label: '256 kbps',       sub: 'High quality'                    },
            { value: '320',  label: '320 kbps',       sub: 'Best MP3 quality'                },
            { value: 'best', label: 'Best available', sub: "Whatever yt-dlp can get"          },
          ]}
        />
      </SettingsGroup>

      <SettingsGroup title="Options">
        <SettingsRow label="Embed artwork" description="Save album cover art inside the downloaded file">
          <Toggle value={artwork} onChange={setArtwork} />
        </SettingsRow>
        <SettingsRow label="Embed lyrics" description="Save synced lyrics inside the downloaded file">
          <Toggle value={lyrics} onChange={setLyrics} />
        </SettingsRow>
        <SettingsRow label="Wi-Fi only" description="Pause downloads when on mobile data">
          <Toggle value={wifiOnly} onChange={setWifi} />
        </SettingsRow>
        <SettingsRow label="Concurrent downloads" value={String(maxConc)} onClick={() => {}}>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); setMaxConc(Math.max(1, maxConc - 1)) }}
              className="w-7 h-7 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] font-bold text-sm"
            >
              −
            </motion.button>
            <span className="text-sm font-bold text-[var(--text-primary)] w-4 text-center">{maxConc}</span>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); setMaxConc(Math.min(8, maxConc + 1)) }}
              className="w-7 h-7 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] font-bold text-sm"
            >
              +
            </motion.button>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
