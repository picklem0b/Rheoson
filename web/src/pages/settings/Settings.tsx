import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Palette, Volume2, Download, Keyboard, Info,
  ChevronRight, ChevronLeft, HardDrive, Bell, Shield, User,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { IconButton } from '@/components/ui/IconButton'
import { APP_VERSION } from '@/lib/constants'
import { cn } from '@/lib/utils'

import AppearanceSection    from './sections/AppearanceSection'
import AudioSection         from './sections/AudioSection'
import DownloadsSection     from './sections/DownloadsSection'
import StorageSection       from './sections/StorageSection'
import AccountSection       from './sections/AccountSection'
import PrivacySection       from './sections/PrivacySection'
import NotificationsSection from './sections/NotificationsSection'
import ShortcutsSection     from './sections/ShortcutsSection'
import AboutSection         from './sections/AboutSection'

type Section =
  | 'appearance' | 'audio'    | 'downloads' | 'storage'
  | 'account'    | 'privacy'  | 'notifications'
  | 'shortcuts'  | 'about'

const SECTIONS: { id: Section; label: string; icon: React.ReactNode; description: string }[] = [
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
  }
}

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
                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{s.description}</p>
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
              <div className="flex items-center gap-3 px-4 lg:px-6 pt-5 pb-4 flex-shrink-0 border-b border-[var(--border)]">
                <IconButton size="sm" variant="ghost" className="lg:hidden" onClick={() => setActive(null)}>
                  <ChevronLeft />
                </IconButton>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    {SECTIONS.find((s) => s.id === active)?.label}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {SECTIONS.find((s) => s.id === active)?.description}
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
