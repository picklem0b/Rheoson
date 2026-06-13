import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { ACCENT_THEMES } from '@/themes'
import { usePersisted } from '@/hooks/usePersisted'
import { SettingsGroup, SettingsRow, Toggle, Slider } from '../components/SettingsPrimitives'

export default function AppearanceSection() {
  const { theme, setAccent, setSurface, glassOpacity, setGlassOpacity } = useThemeStore()
  const [compact,    setCompact]    = usePersisted('compact-mode', false)
  const [showArt,    setShowArt]    = usePersisted('show-artwork', true)
  const [animations, setAnimations] = usePersisted('animations', true)

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
                      exit={{ scale: 0 }}
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
            Currently:{' '}
            <span className="text-[var(--accent)] font-semibold capitalize">
              {theme.accent}
            </span>
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

      <SettingsGroup title="Transparency">
        <div>
          <div className="px-4 pt-3.5 pb-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Glass opacity</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Controls how opaque the sidebar, player bar, and overlays appear
            </p>
          </div>
          <Slider
            value={glassOpacity}
            onChange={setGlassOpacity}
            min={0.1}
            max={1.0}
            step={0.05}
            label="Opacity"
          />
        </div>
      </SettingsGroup>

      <SettingsGroup title="Display">
        <SettingsRow
          label="Compact mode"
          description="Smaller track rows and tighter spacing"
        >
          <Toggle value={compact} onChange={setCompact} />
        </SettingsRow>
        <SettingsRow
          label="Show album art"
          description="Display artwork in track lists"
        >
          <Toggle value={showArt} onChange={setShowArt} />
        </SettingsRow>
        <SettingsRow
          label="Animations"
          description="Motion and transitions throughout the app"
        >
          <Toggle value={animations} onChange={setAnimations} />
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}