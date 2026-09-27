import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Palette, SpeakerHigh, DownloadSimple, Keyboard, Info, CaretRight, CaretLeft, Bell, HardDrives, Layout, ChartLineUp, Stethoscope, SlidersHorizontal, WifiHigh } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { ProfileRow } from '@/components/ui/ProfileRow'
import { APP_VERSION } from '@/lib/constants'
import { cn } from '@/lib/utils'

import AppearanceSection    from './sections/AppearanceSection'
import LayoutSection        from './sections/LayoutSection'
import AudioSection         from './sections/AudioSection'
import PlaybackSection      from './sections/PlaybackSection'
import DownloadsSection     from './sections/DownloadsSection'
import StorageSection       from './sections/StorageSection'
import StreamingSection     from './sections/StreamingSection'
import DataOfflineSection   from './sections/DataOfflineSection'
import AccountSection       from './sections/AccountSection'
import PrivacySection       from './sections/PrivacySection'
import NotificationsSection from './sections/NotificationsSection'
import ShortcutsSection     from './sections/ShortcutsSection'
import AboutSection         from './sections/AboutSection'
import StatsSection         from './sections/StatsSection'
import DiagnosticsSection   from './sections/DiagnosticsSection'

type Section =
  | 'appearance' | 'layout'  | 'audio' | 'playback'
  | 'downloads'  | 'storage' | 'notifications'
  | 'account'    | 'privacy' | 'shortcuts' | 'about'
  | 'stats'      | 'diagnostics' | 'streaming' | 'data-offline'

interface SectionMeta {
  id:    Section
  label: string
  desc:  string
  Icon:  React.ElementType
}

// Icon tiles are intentionally monochrome.
//
// Each row used to carry its own saturated colour (violet, blue, pink, teal,
// olive…), which made the list read as thirteen unrelated products and fought
// the single-accent identity the rest of the app is built on. Neutral tiles
// with the accent reserved for the row you are in is both quieter and a much
// clearer "where am I" signal.
const GROUPS: { label: string; items: SectionMeta[] }[] = [
  {
    label: 'Sound & playback',
    items: [
      { id: 'notifications', label: 'Notifications', desc: 'Sound effects & chimes',       Icon: Bell },
      { id: 'audio',         label: 'Audio quality', desc: 'EQ, normalisation, output',    Icon: SpeakerHigh },
      { id: 'playback',      label: 'Playback',      desc: 'Speed, gapless, seek, haptics', Icon: SlidersHorizontal },
    ],
  },
  {
    label: 'App & data',
    items: [
      { id: 'appearance',    label: 'Appearance',          desc: 'Theme, accent, transparency',  Icon: Palette },
      { id: 'layout',        label: 'Navigation & fonts', desc: 'Nav style, fonts, sidebar',  Icon: Layout },
      { id: 'streaming',     label: 'Streaming',          desc: 'Autoplay, warm-ahead',       Icon: WifiHigh },
      { id: 'data-offline',  label: 'Data-saving & offline', desc: 'Offline cache & limits',  Icon: HardDrives },
      { id: 'downloads',     label: 'Downloads',          desc: 'Format, quality, concurrency', Icon: DownloadSimple },
      { id: 'storage',       label: 'Storage',            desc: 'Directories, library, caches', Icon: HardDrives },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'stats', label: 'Stats', desc: 'Listening analytics & charts', Icon: ChartLineUp },
    ],
  },
  {
    label: 'App',
    items: [
      { id: 'diagnostics', label: 'Doctor',   desc: 'Health, problems, repairs',  Icon: Stethoscope },
      { id: 'shortcuts',   label: 'Shortcuts', desc: 'Keyboard controls',         Icon: Keyboard },
      { id: 'about',       label: 'About',     desc: `v${APP_VERSION} · Credits`, Icon: Info },
    ],
  },
]

function SectionContent({ id }: { id: Section }) {
  switch (id) {
    case 'appearance':    return <AppearanceSection />
    case 'layout':        return <LayoutSection />
    case 'audio':         return <AudioSection />
    case 'playback':      return <PlaybackSection />
    case 'downloads':     return <DownloadsSection />
    case 'storage':       return <StorageSection />
    case 'streaming':     return <StreamingSection />
    case 'data-offline':  return <DataOfflineSection />
    case 'account':       return <AccountSection />
    case 'privacy':       return <PrivacySection />
    case 'notifications': return <NotificationsSection />
    case 'shortcuts':     return <ShortcutsSection />
    case 'about':         return <AboutSection />
    case 'stats':         return <StatsSection />
    case 'diagnostics':   return <DiagnosticsSection />
    default:              return null
  }
}

const DETAIL_SPRING = { type: 'spring' as const, damping: 28, stiffness: 300 }

export default function GearSix() {
  const [active, setActive] = useState<Section | null>(() => {
    // Deep link: /settings?section=privacy opens that section directly —
    // the profile sheet's Privacy and Account entries land here.
    const p = new URLSearchParams(window.location.search).get('section')
    return p && GROUPS.some((g) => g.items.some((s) => s.id === p))
      ? (p as Section)
      : null
  })
  const meta = GROUPS.flatMap((g) => g.items).find((s) => s.id === active) ?? null

  // Lets a section send the user to another one — the Doctor's storage finding
  // links straight to the storage controls it is complaining about.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (id && GROUPS.some((g) => g.items.some((s) => s.id === id))) {
        setActive(id as Section)
      }
    }
    window.addEventListener('rheoson:settings-section', handler)
    return () => window.removeEventListener('rheoson:settings-section', handler)
  }, [])

  return (
    <div className="flex h-full overflow-hidden bg-[var(--bg-base)]">

      {/* ── Left list ─────────────────────────────────────── */}
      <div className={cn(
        'flex-shrink-0 w-full lg:w-[310px] flex flex-col border-r border-[var(--border)]/40',
        active ? 'hidden lg:flex' : 'flex',
      )}>
        {/* pt-12 clears the mobile status bar; on desktop there is no status
            bar to clear, so it collapses back to normal padding. */}
        <div className="px-5 pt-12 lg:pt-8 pb-3 flex-shrink-0 space-y-4">
          <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
            GearSix
          </h1>
          <ProfileRow />
        </div>

        <ScrollArea className="flex-1 px-4 pb-6 pt-1">
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
                      active === s.id ? 'bg-brand/10' : 'hover:bg-[var(--bg-elevated)]',
                    )}
                  >
                    <div
                      className={cn(
                        'w-[32px] h-[32px] rounded-[10px] flex items-center justify-center flex-shrink-0 transition-colors duration-150',
                        active === s.id
                          ? 'bg-brand/15 text-[var(--accent)]'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
                      )}
                    >
                      <s.Icon className="w-[17px] h-[17px]" />
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
                    <CaretRight className={cn(
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
              {/* Detail header */}              <div className="flex items-center gap-3 px-4 lg:px-5 pt-12 lg:pt-8 pb-2 flex-shrink-0">


                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setActive(null)}
                  className="lg:hidden flex items-center gap-1 text-[var(--accent)] mr-1"
                >
                  <CaretLeft className="w-5 h-5" />
                  <span className="text-[17px]">GearSix</span>
                </motion.button>
                <div className="flex-1 flex items-center gap-3 min-w-0">
                <div className="hidden lg:flex w-9 h-9 rounded-[10px] items-center justify-center flex-shrink-0 bg-brand/15 text-[var(--accent)]">
                  <meta.Icon className="w-5 h-5" />
                </div>
                  <h2 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)] lg:text-[20px] leading-tight">
                    {meta.label}
                  </h2>
                </div>
              </div>

              {/* Content is capped + centred on wide screens so groups
                  don't stretch edge-to-edge on large monitors. */}
              <ScrollArea className="flex-1 px-4 lg:px-6 pb-10 pt-3">
                <div className="mx-auto w-full max-w-3xl">
                  <SectionContent id={active} />
                </div>
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
                <CaretRight className="w-6 h-6 text-[var(--text-muted)]/30" />
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
