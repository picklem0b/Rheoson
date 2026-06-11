import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Palette, Volume2, Download, Keyboard, Info,
  ChevronRight, Music2, Moon, Sun, User,
  FolderOpen, Globe, Bell, Shield, Database,
  ChevronLeft, Check, HardDrive, Key, RefreshCw,
  Trash2, ExternalLink, Wifi, Zap,
} from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { ACCENT_THEMES } from '@/themes'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/constants'

// ── Types ─────────────────────────────────────────────────────
type Section =
  | 'appearance'
  | 'audio'
  | 'downloads'
  | 'storage'
  | 'account'
  | 'privacy'
  | 'notifications'
  | 'shortcuts'
  | 'about'

const SECTIONS: {
  id: Section
  label: string
  icon: React.ReactNode
  description: string
}[] = [
  { id: 'appearance',    label: 'Appearance',    icon: <Palette   className="w-4 h-4" />, description: 'Theme, colours, display'         },
  { id: 'audio',         label: 'Audio',         icon: <Volume2   className="w-4 h-4" />, description: 'Quality, equalizer, crossfade'   },
  { id: 'downloads',     label: 'Downloads',     icon: <Download  className="w-4 h-4" />, description: 'Format, quality, location'       },
  { id: 'storage',       label: 'Storage',       icon: <HardDrive className="w-4 h-4" />, description: 'Music dirs, cache, library'      },
  { id: 'account',       label: 'Account',       icon: <User      className="w-4 h-4" />, description: 'Profile, Spotify credentials'    },
  { id: 'privacy',       label: 'Privacy',       icon: <Shield    className="w-4 h-4" />, description: 'History, data, permissions'      },
  { id: 'notifications', label: 'Notifications', icon: <Bell      className="w-4 h-4" />, description: 'Download alerts, updates'        },
  { id: 'shortcuts',     label: 'Shortcuts',     icon: <Keyboard  className="w-4 h-4" />, description: 'Keyboard controls'              },
  { id: 'about',         label: 'About',         icon: <Info      className="w-4 h-4" />, description: 'Version, credits, terms'        },
]

// ── Spotify credential helpers ────────────────────────────────
const SP_ID_KEY     = 'shulker-spotify-client-id'
const SP_SECRET_KEY = 'shulker-spotify-client-secret'

export function useSpotifyCredentials() {
  const [clientId,     setClientIdState]     = useState(() => localStorage.getItem(SP_ID_KEY)     || '')
  const [clientSecret, setClientSecretState] = useState(() => localStorage.getItem(SP_SECRET_KEY) || '')
  const hasCredentials = Boolean(clientId && clientSecret)

  const save = (id: string, secret: string) => {
    localStorage.setItem(SP_ID_KEY,     id)
    localStorage.setItem(SP_SECRET_KEY, secret)
    setClientIdState(id)
    setClientSecretState(secret)
    // Tell the API about new credentials
    fetch('/api/settings/spotify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId: id, clientSecret: secret }),
    }).catch(() => {})
  }

  const clear = () => {
    localStorage.removeItem(SP_ID_KEY)
    localStorage.removeItem(SP_SECRET_KEY)
    setClientIdState('')
    setClientSecretState('')
  }

  return { clientId, clientSecret, hasCredentials, save, clear }
}

// ── Root page ─────────────────────────────────────────────────
export default function Settings() {
  const [active, setActive] = useState<Section | null>(null)

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: section list ─────────────────────────────── */}
      <div className={cn(
        'flex-shrink-0 w-full lg:w-72 border-r border-[var(--border)] flex flex-col',
        active ? 'hidden lg:flex' : 'flex',
      )}>
        <div className="px-4 lg:px-6 pt-6 pb-4 flex-shrink-0">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">v{APP_VERSION}</p>
        </div>

        <ScrollArea className="flex-1 px-2 pb-6">
          {SECTIONS.map((s, i) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActive(s.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-2xl mb-1',
                'transition-all duration-200 text-left',
                active === s.id
                  ? 'bg-[var(--accent-subtle)] border border-[var(--accent-border)]'
                  : 'hover:bg-[var(--bg-elevated)]',
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
                active === s.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              )}>
                {s.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-sm font-semibold truncate',
                  active === s.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]',
                )}>
                  {s.label}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                  {s.description}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
            </motion.button>
          ))}
        </ScrollArea>
      </div>

      {/* ── Right: section detail ──────────────────────────── */}
      <div className={cn(
        'flex-1 min-w-0 flex flex-col overflow-hidden',
        !active ? 'hidden lg:flex' : 'flex',
      )}>
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0  }}
              exit={{   opacity: 0, x: -10 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="flex flex-col h-full"
            >
              {/* Sub-header */}
              <div className="flex items-center gap-3 px-4 lg:px-6 pt-5 pb-4 flex-shrink-0 border-b border-[var(--border)]">
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="lg:hidden"
                  onClick={() => setActive(null)}
                >
                  <ChevronLeft />
                </IconButton>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    {SECTIONS.find(s => s.id === active)?.label}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {SECTIONS.find(s => s.id === active)?.description}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 px-4 lg:px-6 py-5">
                <SectionContent section={active} />
              </ScrollArea>
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="hidden lg:flex flex-1 items-center justify-center flex-col gap-4"
            >
              <div className="w-20 h-20 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
                <ChevronRight className="w-8 h-8 text-[var(--text-muted)]" />
              </div>
              <div className="text-center">
                <p className="text-[var(--text-secondary)] font-semibold">Select a section</p>
                <p className="text-[var(--text-muted)] text-sm mt-1">Choose from the left to configure Shulker</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Section router ────────────────────────────────────────────
function SectionContent({ section }: { section: Section }) {
  switch (section) {
    case 'appearance':    return <AppearanceSection />
    case 'audio':         return <AudioSection />
    case 'downloads':     return <DownloadsSection />
    case 'storage':       return <StorageSection />
    case 'account':       return <AccountSection />
    case 'privacy':       return <PrivacySection />
    case 'notifications': return <NotificationsSection />
    case 'shortcuts':     return <ShortcutsSection />
    case 'about':         return <AboutSection />
    default:              return null
  }
}

// ── Shared primitives ─────────────────────────────────────────
function SettingsGroup({
  title, children, className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5', className)}>
      {title && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">
          {title}
        </p>
      )}
      <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
        {children}
      </div>
    </div>
  )
}

function SettingsRow({
  label, description, value, onClick, children, danger,
}: {
  label:       string
  description?: string
  value?:      string
  onClick?:    () => void
  children?:   React.ReactNode
  danger?:     boolean
}) {
  const Tag = onClick ? motion.button : 'div' as any
  return (
    <Tag
      whileHover={onClick ? { backgroundColor: 'var(--bg-elevated)' } : undefined}
      whileTap={onClick   ? { scale: 0.99 }                           : undefined}
      onClick={onClick}
      className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className={cn(
          'text-sm font-semibold',
          danger ? 'text-red-400' : 'text-[var(--text-primary)]',
        )}>
          {label}
        </p>
        {description && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {children ?? (
          <>
            {value  && <span className="text-xs text-[var(--text-muted)] font-medium">{value}</span>}
            {onClick && <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
          </>
        )}
      </div>
    </Tag>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      onClick={() => onChange(!value)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors duration-300 flex-shrink-0',
        value ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]',
      )}
    >
      <motion.div
        animate={{ x: value ? 20 : 2 }}
        transition={{ type: 'spring', damping: 20, stiffness: 350 }}
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
      />
    </motion.button>
  )
}

function RadioGroup<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; sub?: string }[]
  value:   T
  onChange:(v: T) => void
}) {
  return (
    <>
      {options.map((o) => (
        <SettingsRow
          key={o.value}
          label={o.label}
          description={o.sub}
          onClick={() => onChange(o.value)}
        >
          <div className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
            value === o.value
              ? 'border-[var(--accent)] bg-[var(--accent)]'
              : 'border-[var(--border-strong)]',
          )}>
            {value === o.value && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        </SettingsRow>
      ))}
    </>
  )
}

// ── APPEARANCE ────────────────────────────────────────────────
function AppearanceSection() {
  const { theme, setAccent, setSurface } = useThemeStore()
  const [compact,   setCompact]   = useState(false)
  const [showArt,   setShowArt]   = useState(true)
  const [animations,setAnimations]= useState(true)

  return (
    <div className="pb-2">
      <SettingsGroup title="Accent colour">
        <div className="px-4 py-5">
          <div className="flex gap-3 flex-wrap">
            {ACCENT_THEMES.map((t) => (
              <motion.button
                key={t.id}
                whileHover={{ scale: 1.18 }}
                whileTap={{ scale: 0.88 }}
                onClick={() => setAccent(t.id)}
                title={t.label}
                className="relative w-10 h-10 rounded-full border-2 transition-all duration-200 shadow-md"
                style={{
                  background:  `linear-gradient(135deg, ${t.color}, ${t.bright})`,
                  borderColor: theme.accent === t.id ? 'white' : 'transparent',
                  boxShadow:   theme.accent === t.id ? `0 0 0 3px ${t.color}44` : undefined,
                }}
              >
                <AnimatePresence>
                  {theme.accent === t.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{   scale: 0 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Check className="w-4 h-4 text-white drop-shadow" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">
            Currently: <span className="text-[var(--accent)] font-semibold capitalize">{theme.accent}</span>
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Surface">
        <SettingsRow label="Dark" description="Deep black background">
          <Toggle value={theme.surface === 'dark'} onChange={() => setSurface('dark')} />
        </SettingsRow>
        <SettingsRow label="Light" description="Clean white background">
          <Toggle value={theme.surface === 'light'} onChange={() => setSurface('light')} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Display">
        <SettingsRow label="Compact mode" description="Smaller track rows and tighter spacing">
          <Toggle value={compact} onChange={setCompact} />
        </SettingsRow>
        <SettingsRow label="Show album art" description="Display artwork in track lists">
          <Toggle value={showArt} onChange={setShowArt} />
        </SettingsRow>
        <SettingsRow label="Animations" description="Motion and transitions throughout the app">
          <Toggle value={animations} onChange={setAnimations} />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

// ── AUDIO ─────────────────────────────────────────────────────
function AudioSection() {
  const [crossfade, setCrossfade]   = useState(false)
  const [normalize, setNormalize]   = useState(true)
  const [gapless,   setGapless]     = useState(true)
  const [quality,   setQuality]     = useState<'low'|'normal'|'high'|'very_high'>('very_high')

  return (
    <div className="pb-2">
      <SettingsGroup title="Playback">
        <SettingsRow label="Crossfade" description="Smooth transition between tracks — fades out the current and fades in the next">
          <Toggle value={crossfade} onChange={setCrossfade} />
        </SettingsRow>
        <SettingsRow label="Volume normalisation" description="Equalise loudness across all tracks">
          <Toggle value={normalize} onChange={setNormalize} />
        </SettingsRow>
        <SettingsRow label="Gapless playback" description="Remove silence between consecutive tracks">
          <Toggle value={gapless} onChange={setGapless} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Streaming quality">
        <RadioGroup
          value={quality}
          onChange={setQuality}
          options={[
            { value: 'low',       label: 'Low',       sub: '128 kbps — saves data'           },
            { value: 'normal',    label: 'Normal',    sub: '192 kbps — balanced'              },
            { value: 'high',      label: 'High',      sub: '256 kbps — great quality'         },
            { value: 'very_high', label: 'Very High', sub: '320 kbps — best streaming quality'},
          ]}
        />
      </SettingsGroup>

      <SettingsGroup title="Equalizer">
        <SettingsRow label="Open equalizer" description="Fine-tune frequency bands" onClick={() => {}} />
        <SettingsRow label="Preset" value="Flat" onClick={() => {}} />
      </SettingsGroup>
    </div>
  )
}

// ── DOWNLOADS ─────────────────────────────────────────────────
function DownloadsSection() {
  const [fmt,     setFmt]     = useState<'mp3'|'flac'|'opus'|'m4a'|'wav'>('mp3')
  const [quality, setQuality] = useState<'128'|'192'|'256'|'320'|'best'>('320')
  const [artwork, setArtwork] = useState(true)
  const [lyrics,  setLyrics]  = useState(true)
  const [wifiOnly,setWifi]    = useState(false)
  const [maxConc, setMaxConc] = useState(4)

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
            { value: '128',  label: '128 kbps', sub: 'Small files, acceptable quality' },
            { value: '192',  label: '192 kbps', sub: 'Good balance'                    },
            { value: '256',  label: '256 kbps', sub: 'High quality'                    },
            { value: '320',  label: '320 kbps', sub: 'Best MP3 quality'                },
            { value: 'best', label: 'Best available', sub: 'Whatever yt-dlp can get'   },
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
            >−</motion.button>
            <span className="text-sm font-bold text-[var(--text-primary)] w-4 text-center">{maxConc}</span>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); setMaxConc(Math.min(8, maxConc + 1)) }}
              className="w-7 h-7 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] font-bold text-sm"
            >+</motion.button>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

// ── STORAGE ───────────────────────────────────────────────────
function StorageSection() {
  const [dirs, setDirs] = useState([
    { path: '/data/data/com.termux/files/home/shulker/music', active: true  },
    { path: '/storage/emulated/0/Music',                      active: true  },
    { path: '/storage/emulated/0/Download',                   active: false },
  ])

  const [customDir, setCustomDir] = useState('')
  const [adding,    setAdding]    = useState(false)

  const addDir = () => {
    if (!customDir.trim()) return
    setDirs(d => [...d, { path: customDir.trim(), active: true }])
    setCustomDir('')
    setAdding(false)
  }

  return (
    <div className="pb-2">
      <SettingsGroup title="Music directories">
        {dirs.map((d, i) => (
          <div key={d.path} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {d.path.split('/').pop()}
              </p>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{d.path}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Toggle
                value={d.active}
                onChange={(v) => setDirs(dirs.map((x, j) => j === i ? { ...x, active: v } : x))}
              />
            </div>
          </div>
        ))}

        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{   height: 0,    opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 py-3 flex gap-2">
                <input
                  value={customDir}
                  onChange={(e) => setCustomDir(e.target.value)}
                  placeholder="/path/to/music"
                  className="flex-1 h-9 px-3 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                />
                <Button size="sm" variant="primary" onClick={addDir}>Add</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <SettingsRow
          label="Add directory"
          description="Scan a new folder for music files"
          onClick={() => setAdding(!adding)}
        >
          <FolderOpen className="w-4 h-4 text-[var(--accent)]" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Library">
        <SettingsRow label="Rescan library" description="Re-index all music directories" onClick={() => {}}>
          <RefreshCw className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Library size" value="248 tracks" />
        <SettingsRow label="Export library" description="Save your library as JSON" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Cache">
        <SettingsRow label="Stream cache" value="124 MB" />
        <SettingsRow label="Artwork cache" value="38 MB" />
        <SettingsRow label="Clear all cache" danger onClick={() => {}}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

// ── ACCOUNT ───────────────────────────────────────────────────
function AccountSection() {
  const { clientId, clientSecret, hasCredentials, save, clear } = useSpotifyCredentials()
  const [editId,     setEditId]     = useState(clientId)
  const [editSecret, setEditSecret] = useState(clientSecret)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const handleSave = async () => {
    if (!editId.trim() || !editSecret.trim()) return
    setSaving(true)
    save(editId.trim(), editSecret.trim())
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="pb-2">
      <SettingsGroup title="Profile">
        <div className="px-4 py-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-2xl font-bold text-white shadow-lg">
            L
          </div>
          <div>
            <p className="font-bold text-[var(--text-primary)] text-lg">LethaboK</p>
            <p className="text-sm text-[var(--text-muted)]">lethabokhedama-png</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Self-hosted · Local</p>
          </div>
        </div>
        <SettingsRow label="Edit display name" onClick={() => {}} />
        <SettingsRow label="Change avatar" onClick={() => {}} />
      </SettingsGroup>

      {/* Spotify credentials — this is what unlocks everything */}
      <SettingsGroup title="Spotify credentials">
        <div className="px-4 py-4 space-y-3">
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold',
            hasCredentials
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
          )}>
            <Key className="w-3.5 h-3.5" />
            {hasCredentials
              ? '✓ Spotify connected — search, playlists and trending are unlocked'
              : '⚠ No credentials — add your Spotify Client ID and Secret below'}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Client ID
            </label>
            <input
              value={editId}
              onChange={(e) => setEditId(e.target.value)}
              placeholder="e.g. c6081b467a154fd69ba432261b973cd5"
              className="w-full h-10 px-3 text-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] font-mono"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Client Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={editSecret}
                onChange={(e) => setEditSecret(e.target.value)}
                placeholder="e.g. 82ec996a6dba4218965bfea6483bd9c5"
                className="w-full h-10 px-3 pr-10 text-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] font-mono"
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs"
              >
                {showSecret ? 'hide' : 'show'}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={handleSave}
              className="flex-1"
            >
              {saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save credentials'}
            </Button>
            {hasCredentials && (
              <Button variant="danger" size="sm" onClick={clear}>
                Disconnect
              </Button>
            )}
          </div>

          <p className="text-xs text-[var(--text-muted)] leading-relaxed pt-1">
            Get your credentials at{' '}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline"
            >
              developer.spotify.com/dashboard
            </a>
            . Create an app, copy the Client ID and Client Secret. These are stored locally and only used for metadata — Shulker never streams from Spotify.
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow
          label="Clear all app data"
          description="Wipes all settings, playlists, history. Cannot be undone."
          danger
          onClick={() => { localStorage.clear(); window.location.reload() }}
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

// ── PRIVACY ───────────────────────────────────────────────────
function PrivacySection() {
  const [history,   setHistory]   = useState(true)
  const [analytics, setAnalytics] = useState(false)
  const [searchLog, setSearchLog] = useState(true)

  return (
    <div className="pb-2">
      <SettingsGroup title="History">
        <SettingsRow label="Save play history" description="Track your recently played songs across sessions">
          <Toggle value={history} onChange={setHistory} />
        </SettingsRow>
        <SettingsRow label="Save search history" description="Remember recent searches">
          <Toggle value={searchLog} onChange={setSearchLog} />
        </SettingsRow>
        <SettingsRow label="Clear play history" danger onClick={() => {}}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
        <SettingsRow label="Clear search history" danger onClick={() => {}}>
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Data">
        <SettingsRow
          label="Anonymous analytics"
          description="Help improve Shulker by sharing anonymous usage data. No personal data is collected."
        >
          <Toggle value={analytics} onChange={setAnalytics} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Legal">
        <SettingsRow label="Terms of service" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Privacy policy" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow
    label="Open source licences"
    onClick={() => {
      window.open(
        'https://www.gnu.org/licenses/gpl-3.0-standalone.html',
        '_blank'
      )
    }}
  >
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
function NotificationsSection() {
  const [dlDone,  setDlDone]  = useState(true)
  const [dlFail,  setDlFail]  = useState(true)
  const [sound,   setSound]   = useState(true)
  const [updates, setUpdates] = useState(false)

  return (
    <div className="pb-2">
      <SettingsGroup title="Downloads">
        <SettingsRow label="Download complete" description="Play a sound and show a notification when a track finishes downloading">
          <Toggle value={dlDone} onChange={setDlDone} />
        </SettingsRow>
        <SettingsRow label="Download failed" description="Alert when a download encounters an error">
          <Toggle value={dlFail} onChange={setDlFail} />
        </SettingsRow>
        <SettingsRow label="Sound effects" description="Play rhea.mp3 on download complete">
          <Toggle value={sound} onChange={setSound} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="App">
        <SettingsRow label="Update available" description="Notify when a new version of Shulker is available">
          <Toggle value={updates} onChange={setUpdates} />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}

// ── SHORTCUTS ─────────────────────────────────────────────────
function ShortcutsSection() {
  const shortcuts = [
    { key: 'Space',     action: 'Play / Pause'           },
    { key: '← →',      action: 'Seek ±10 seconds'        },
    { key: '↑ ↓',      action: 'Volume ±10%'             },
    { key: 'N',         action: 'Next track'             },
    { key: 'P',         action: 'Previous track'         },
    { key: 'R',         action: 'Cycle repeat mode'      },
    { key: 'S',         action: 'Toggle shuffle'         },
    { key: 'Q',         action: 'Toggle queue panel'     },
    { key: 'L',         action: 'Toggle lyrics panel'    },
    { key: 'M',         action: 'Mute / unmute'          },
    { key: 'F',         action: 'Fullscreen player'      },
    { key: 'Ctrl + F',  action: 'Focus search'           },
    { key: 'Ctrl + D',  action: 'Download current track' },
    { key: 'Esc',       action: 'Close panels'           },
  ]

  return (
    <div className="pb-2">
      <SettingsGroup title="Player controls">
        {shortcuts.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--border)] last:border-0">
            <span className="text-sm text-[var(--text-secondary)]">{s.action}</span>
            <kbd className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] flex-shrink-0">
              {s.key}
            </kbd>
          </div>
        ))}
      </SettingsGroup>
    </div>
  )
}

// ── ABOUT ─────────────────────────────────────────────────────
function AboutSection() {
  return (
    <div className="pb-2">
      <SettingsGroup>
        <div className="flex items-center gap-4 px-4 py-5">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent-subtle)]">
            <Music2 className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="font-bold text-[var(--text-primary)] text-lg tracking-tight">Shulker</p>
            <p className="text-sm text-[var(--text-muted)]">v{APP_VERSION}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Built by LethaboK</p>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Stack">
        {[
          { label: 'yt-dlp',       value: '2026.3.17' },
          { label: 'ytmusicapi',   value: '1.12.0'    },
          { label: 'FastAPI',      value: '0.103+'    },
          { label: 'React',        value: '18.3'      },
          { label: 'Framer Motion',value: '11'        },
          { label: 'Howler.js',    value: '2.2.4'     },
          { label: 'Zustand',      value: '4.5'       },
        ].map((d) => (
          <SettingsRow key={d.label} label={d.label} value={d.value} />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Links">
        <SettingsRow label="GitHub" description="lethabokhedama-png/shulker" onClick={() => window.open('https://github.com/lethabokhedama-png/shulker')}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Report a bug" onClick={() => window.open('https://github.com/lethabokhedama-png/shulker/issues')}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Terms of service" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Privacy policy" onClick={() => {}}>
          <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <SettingsRow
          label="Clear all app data"
          description="Reset everything — settings, theme, history, playlists. Cannot be undone."
          danger
          onClick={() => { localStorage.clear(); window.location.reload() }}
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}
