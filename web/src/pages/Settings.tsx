import { motion } from 'framer-motion'
import {
  Palette, Volume2, Download, Keyboard,
  Info, ChevronRight, Music2, Moon, Sun,
} from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { ACCENT_THEMES } from '@/themes'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/constants'

export default function Settings() {
  const { theme, setAccent, setSurface } = useThemeStore()

  return (
    <ScrollArea className="h-full">
      <div className="px-4 lg:px-8 pt-6 pb-12 max-w-2xl space-y-8">

        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-[var(--text-primary)]"
        >
          Settings
        </motion.h1>

        {/* ── Appearance ──────────────────────────────────── */}
        <Section title="Appearance" icon={<Palette className="w-4 h-4" />}>

          {/* Theme colour */}
          <SettingRow label="Accent colour" description="Personalise your experience">
            <div className="flex gap-2 flex-wrap">
              {ACCENT_THEMES.map((t) => (
                <motion.button
                  key={t.id}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setAccent(t.id)}
                  title={t.label}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-all duration-200',
                    theme.accent === t.id
                      ? 'border-white scale-110 shadow-lg'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  )}
                  style={{ background: `linear-gradient(135deg, ${t.color}, ${t.bright})` }}
                />
              ))}
            </div>
          </SettingRow>

          {/* Surface mode */}
          <SettingRow label="Surface" description="Dark or light background">
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((s) => (
                <motion.button
                  key={s}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setSurface(s)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
                    'border transition-all duration-200',
                    theme.surface === s
                      ? 'bg-[var(--text-primary)] text-[var(--bg-base)] border-transparent'
                      : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)]'
                  )}
                >
                  {s === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </motion.button>
              ))}
            </div>
          </SettingRow>
        </Section>

        {/* ── Audio ───────────────────────────────────────── */}
        <Section title="Audio" icon={<Volume2 className="w-4 h-4" />}>
          <NavRow label="Equalizer" description="Fine-tune your sound" />
          <NavRow label="Audio quality" description="Streaming quality" value="High" />
          <NavRow label="Crossfade" description="Smooth between tracks" value="Off" />
        </Section>

        {/* ── Downloads ───────────────────────────────────── */}
        <Section title="Downloads" icon={<Download className="w-4 h-4" />}>
          <NavRow label="Default format" description="File format for downloads" value="MP3" />
          <NavRow label="Default quality" description="Bitrate for downloads" value="320kbps" />
          <NavRow label="Download location" description="Where files are saved" value="~/music" />
          <NavRow label="Embed artwork" description="Save cover art in file" value="On" />
          <NavRow label="Embed lyrics" description="Save lyrics in file" value="On" />
        </Section>

        {/* ── Shortcuts ───────────────────────────────────── */}
        <Section title="Keyboard shortcuts" icon={<Keyboard className="w-4 h-4" />}>
          {[
            { key: 'Space',    action: 'Play / Pause' },
            { key: '←  →',    action: 'Seek ±10 seconds' },
            { key: '↑  ↓',    action: 'Volume ±10%' },
            { key: 'N',        action: 'Next track' },
            { key: 'P',        action: 'Previous track' },
            { key: 'R',        action: 'Cycle repeat' },
            { key: 'S',        action: 'Toggle shuffle' },
            { key: 'Q',        action: 'Toggle queue' },
            { key: 'L',        action: 'Toggle lyrics' },
          ].map((s) => (
            <div key={s.key} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-[var(--text-secondary)]">{s.action}</span>
              <kbd className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)]">
                {s.key}
              </kbd>
            </div>
          ))}
        </Section>

        {/* ── About ───────────────────────────────────────── */}
        <Section title="About" icon={<Info className="w-4 h-4" />}>
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-lg">
              <Music2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-[var(--text-primary)]">Shulker</p>
              <p className="text-sm text-[var(--text-muted)]">v{APP_VERSION}</p>
            </div>
          </div>
          <NavRow label="yt-dlp version" value="2026.3.17" />
        </Section>

      </div>
    </ScrollArea>
  )
}

function Section({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', damping: 22 }}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-[var(--accent)]">{icon}</span>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">{title}</h2>
      </div>
      <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
        {children}
      </div>
    </motion.div>
  )
}

function SettingRow({ label, description, children }: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function NavRow({ label, description, value }: {
  label: string
  description?: string
  value?: string
}) {
  return (
    <motion.button
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      whileTap={{ scale: 0.99 }}
      className="w-full flex items-center justify-between gap-4 px-4 py-3.5 transition-colors text-left"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {value && <span className="text-xs text-[var(--text-muted)] font-medium">{value}</span>}
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </motion.button>
  )
}