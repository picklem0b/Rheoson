import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Palette, Volume2, Download, Keyboard, Info,
  ChevronRight, ChevronLeft, User, Bell, Shield,
  HardDrive, Layout, BarChart3,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { APP_VERSION } from '@/lib/constants'
import { cn } from '@/lib/utils'

import AppearanceSection    from './sections/AppearanceSection'
import LayoutSection        from './sections/LayoutSection'
import AudioSection         from './sections/AudioSection'
import DownloadsSection     from './sections/DownloadsSection'
import StorageSection       from './sections/StorageSection'
import AccountSection       from './sections/AccountSection'
import PrivacySection       from './sections/PrivacySection'
import NotificationsSection from './sections/NotificationsSection'
import ShortcutsSection     from './sections/ShortcutsSection'
import AboutSection         from './sections/AboutSection'
import StatsSection         from './sections/StatsSection'

type Section =
  | 'appearance' | 'layout'  | 'audio'
  | 'downloads'  | 'storage' | 'notifications'
  | 'account'    | 'privacy' | 'shortcuts' | 'about'
  | 'stats'

interface SectionMeta {
  id:    Section
  label: string
  desc:  string
  Icon:  React.ElementType
  bg:    string
}

const GROUPS: { label: string; items: SectionMeta[] }[] = [
  {
    label: 'Personalisation',
    items: [
      { id: 'appearance', label: 'Appearance',    desc: 'Theme, accent, transparency',   Icon: Palette,   bg: '#8B5CF6' },
      { id: 'layout',     label: 'Layout',        desc: 'Navigation, fonts, sidebar',    Icon: Layout,    bg: '#3B82F6' },
      { id: 'audio',      label: 'Audio',         desc: 'Quality, crossfade, EQ',        Icon: Volume2,   bg: '#0EA5E9' },
      { id: 'downloads',  label: 'Downloads',     desc: 'Format, quality, concurrency',  Icon: Download,  bg: '#22C55E' },
      { id: 'storage',    label: 'Storage',       desc: 'Directories, library, cache',   Icon: HardDrive, bg: '#F97316' },
    ],
  },
  {
    label: 'Account & privacy',
    items: [
      { id: 'notifications', label: 'Notifications', desc: 'Alerts, sounds, updates',      Icon: Bell,     bg: '#EAB308' },
      { id: 'account',       label: 'Account',       desc: 'Profile, Spotify credentials', Icon: User,     bg: '#EC4899' },
      { id: 'privacy',       label: 'Privacy',       desc: 'History, data, legal',         Icon: Shield,   bg: '#6B7280' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'stats',     label: 'Stats',     desc: 'Listening analytics & charts', Icon: BarChart3, bg: '#8B5CF6' },
    ],
  },
  {
    label: 'App',
    items: [
      { id: 'shortcuts', label: 'Shortcuts', desc: 'Keyboard controls',           Icon: Keyboard, bg: '#64748B' },
      { id: 'about',     label: 'About',     desc: `v${APP_VERSION} · Credits`,   Icon: Info,     bg: '#14B8A6' },
    ],
  },
]

function SectionContent({ id }: { id: Section }) {
  switch (id) {
    case 'appearance':    return <AppearanceSection />
    case 'layout':        return <LayoutSection />
    case 'audio':         return <AudioSection />
    case 'downloads':     return <DownloadsSection />
    case 'storage':       return <StorageSection />
    case 'account':       return <AccountSection />
    case 'privacy':       return <PrivacySection />
    case 'notifications': return <NotificationsSection />
    case 'shortcuts':     return <ShortcutsSection />
    case 'about':         return <AboutSection />
    case 'stats':         return <StatsSection />
    default:              return null
  }
}

const DETAIL_SPRING = { type: 'spring' as const, damping: 28, stiffness: 300 }

export default function Settings() {
  const [active, setActive] = useState<Section | null>(null)
  const meta = GROUPS.flatMap((g) => g.items).find((s) => s.id === active) ?? null

  return (
    <div className="flex h-full overflow-hidden bg-[var(--bg-base)]">

      {/* ── Left list ─────────────────────────────────────── */}
      <div className={cn(
        'flex-shrink-0 w-full lg:w-[310px] flex flex-col border-r border-[var(--border)]/40',
        active ? 'hidden lg:flex' : 'flex',
      )}>
        <div className="px-5 pt-12 pb-2 flex-shrink-0">
          <h1 className="text-[32px] font-bold tracking-tight text-[var(--text-primary)]">
            Settings
          </h1>
        </div>

        <ScrollArea className="flex-1 px-4 pb-6 pt-3">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">
                {g.label}
              </p>
              <div className="bg-[var(--bg-surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--border)]/40 border border-[var(--border)]/30">
                {g.items.map((s, i) => (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02, type: 'spring', damping: 26, stiffness: 300 }}
                    whileTap={{ opacity: 0.55 }}
                    onClick={() => setActive(s.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3.5 py-[11px] text-left transition-colors duration-100',
                      active === s.id ? 'bg-[var(--accent)]/8' : 'hover:bg-[var(--bg-elevated)]',
                    )}
                  >
                    <div
                      className="w-[32px] h-[32px] rounded-[8px] flex items-center justify-center flex-shrink-0"
                      style={{ background: s.bg }}
                    >
                      <s.Icon className="w-[17px] h-[17px] text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-[15px] leading-snug',
                        active === s.id
                          ? 'font-semibold text-[var(--accent)]'
                          : 'font-[440] text-[var(--text-primary)]',
                      )}>
                        {s.label}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)] truncate leading-snug mt-[1px]">
                        {s.desc}
                      </p>
                    </div>
                    <ChevronRight className={cn(
                      'w-4 h-4 flex-shrink-0',
                      active === s.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]/35',
                    )} />
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* ── Right detail ──────────────────────────────────── */}
      <div className={cn(
        'flex-1 min-w-0 flex flex-col overflow-hidden',
        !active ? 'hidden lg:flex' : 'flex',
      )}>
        <AnimatePresence mode="wait" initial={false}>
          {active && meta ? (
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={DETAIL_SPRING}
              className="flex flex-col h-full"
            >
              {/* Detail header */}
              <div className="flex items-center gap-3 px-4 lg:px-5 pt-12 pb-2 flex-shrink-0">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setActive(null)}
                  className="lg:hidden flex items-center gap-1 text-[var(--accent)] mr-1"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span className="text-[17px]">Settings</span>
                </motion.button>
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <div
                    className="hidden lg:flex w-9 h-9 rounded-[10px] items-center justify-center flex-shrink-0"
                    style={{ background: meta.bg }}
                  >
                    <meta.Icon className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)] lg:text-[20px] leading-tight">
                    {meta.label}
                  </h2>
                </div>
              </div>

              <ScrollArea className="flex-1 px-4 lg:px-5 pb-10 pt-3">
                <SectionContent id={active} />
              </ScrollArea>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="hidden lg:flex flex-1 items-center justify-center flex-col gap-4"
            >
              <div className="w-14 h-14 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center">
                <ChevronRight className="w-6 h-6 text-[var(--text-muted)]/30" />
              </div>
              <div className="text-center">
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">Select a section</p>
                <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Configure Rheoson from the sidebar</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
