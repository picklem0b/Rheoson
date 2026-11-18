import { motion, AnimatePresence } from "framer-motion";
import { Check, Sun, Moon } from '@phosphor-icons/react';
import { useThemeStore } from "@/store/theme.store";
import { useUIStore } from "@/store/ui.store";
import { ACCENT_THEMES } from "@/themes";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   Slider,
   RadioGroup
} from "../components/SettingsPrimitives";

export default function AppearanceSection() {
   const { theme, glassOpacity, setAccent, setSurface, setGlassOpacity } =
      useThemeStore();
   const {
      reduceMotion,
      setReduceMotion,
      navStyle,
      navPosition,
      fontFamily,
      fontSize,
      sidebarCollapsed,
      toggleSidebar,
      setNavStyle,
      setNavPosition,
      setFontFamily,
      setFontSize
   } = useUIStore();

   return (
      <div className='pb-4'>
         {/* Accent colour */}
         <SettingsGroup title='Accent colour'>
            <div className='px-4 py-5'>
               <div className='flex gap-4 flex-wrap'>
                  {ACCENT_THEMES.map(t => (
                     <motion.button
                        key={t.id}
                        whileTap={{ scale: 0.82 }}
                        transition={{
                           type: "spring",
                           damping: 18,
                           stiffness: 400
                        }}
                        onClick={() => setAccent(t.id)}
                        title={t.label}
                        className='relative w-10 h-10 rounded-full flex-shrink-0 transition-shadow duration-200'
                        style={{
                           background: `linear-gradient(135deg, ${t.color}, ${t.bright})`,
                           boxShadow:
                              theme.accent === t.id
                                 ? `0 0 0 3px var(--bg-base), 0 0 0 5px ${t.color}`
                                 : "0 2px 6px rgba(0,0,0,0.22)"
                        }}>
                        <AnimatePresence>
                           {theme.accent === t.id && (
                              <motion.div
                                 initial={{ scale: 0, opacity: 0 }}
                                 animate={{ scale: 1, opacity: 1 }}
                                 exit={{ scale: 0, opacity: 0 }}
                                 transition={{
                                    type: "spring",
                                    damping: 20,
                                    stiffness: 400
                                 }}
                                 className='absolute inset-0 flex items-center justify-center'>
                                 <Check
                                    className='w-[18px] h-[18px] text-white drop-shadow'
                                 />
                              </motion.div>
                           )}
                        </AnimatePresence>
                     </motion.button>
                  ))}
               </div>
               <p className='text-[12px] text-[var(--text-muted)] mt-4'>
                  Active:{" "}
                  <span
                     className='font-semibold capitalize'
                     style={{ color: "var(--accent)" }}>
                     {theme.accent}
                  </span>
               </p>
            </div>
         </SettingsGroup>

         {/* Surface */}
         <SettingsGroup title='Appearance'>
            <SettingsRow
               label='Dark'
               description='Deep black — recommended for AMOLED screens'
               onClick={() => setSurface("dark")}
               icon={<Moon className='w-[14px] h-[14px]' />}
               iconBg='#1C1C1E'>
               <AnimatePresence>
                  {theme.surface === "dark" && (
                     <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{
                           type: "spring",
                           damping: 20,
                           stiffness: 400
                        }}>
                        <Check
                           className='w-[20px] h-[20px] text-[var(--accent)]'
                           strokeWidth={2.5}
                        />
                     </motion.div>
                  )}
               </AnimatePresence>
            </SettingsRow>
            <SettingsRow
               label='Light'
               description='Clean white — great in bright environments'
               onClick={() => setSurface("light")}
               icon={<Sun className='w-[14px] h-[14px]' />}
               iconBg='#F2C94C'>
               <AnimatePresence>
                  {theme.surface === "light" && (
                     <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{
                           type: "spring",
                           damping: 20,
                           stiffness: 400
                        }}>
                        <Check
                           className='w-[20px] h-[20px] text-[var(--accent)]'
                           strokeWidth={2.5}
                        />
                     </motion.div>
                  )}
               </AnimatePresence>
            </SettingsRow>
         </SettingsGroup>

         {/* Transparency */}
         <SettingsGroup
            title='Transparency'
            footer='Controls how opaque the sidebar, player bar, and overlay panels appear.'>
            <Slider
               value={glassOpacity}
               onChange={setGlassOpacity}
               min={0.1}
               max={1.0}
               step={0.05}
               label='Glass opacity'
               formatValue={v => `${Math.round(v * 100)}%`}
            />
         </SettingsGroup>

         {/* Motion */}
         <SettingsGroup
            title='Motion'
            footer='Reduce motion jumps every animation straight to its end state — the whole app stops moving. Gentle on eyes and battery.'>
            <SettingsRow
               label='Reduce motion'
               description='Stop animations across the entire app'>
               <Toggle value={reduceMotion} onChange={setReduceMotion} />
            </SettingsRow>
         </SettingsGroup>

         {/* Everything visual lives here, by contract: accent, theme,
             transparency, motion, how the app is laid out (nav style and
             position), typography (font and text size) and the desktop
             sidebar toggle. Behaviour toggles belong to their behaviour's
             section (keep-awake → Playback, warm-ahead → Streaming). */}

         {/* Navigation style */}
         <SettingsGroup
            title='Navigation style'
            footer='Changes take effect immediately. Pill is the default floating style. Flat is a solid bar. Minimal shows icons only.'>
            <RadioGroup
               value={navStyle}
               onChange={setNavStyle}
               options={[
                  {
                     value: "pill",
                     label: "Pill",
                     sub: "Floating rounded bar — default Rheoson style"
                  },
                  {
                     value: "flat",
                     label: "Flat",
                     sub: "Solid bar with no rounding — edge-to-edge"
                  },
                  {
                     value: "minimal",
                     label: "Minimal",
                     sub: "Icons only, no labels — maximum space"
                  }
               ]}
            />
         </SettingsGroup>

         <SettingsGroup
            title='Navigation position'
            footer='Bottom navigation is standard on mobile. Top bar mode moves the tabs to a top tab strip.'>
            <RadioGroup
               value={navPosition}
               onChange={setNavPosition}
               options={[
                  {
                     value: "bottom",
                     label: "Bottom",
                     sub: "Standard mobile bottom navigation"
                  },
                  {
                     value: "top",
                     label: "Top",
                     sub: "Tab bar along the top of the screen"
                  }
               ]}
            />
         </SettingsGroup>

         {/* Typography */}
         <SettingsGroup
            title='Font'
            footer='Plus Jakarta Sans is the Rheoson default. Changes apply immediately across the entire app.'>
            <RadioGroup
               value={fontFamily}
               onChange={setFontFamily}
               options={[
                  {
                     value: "plus-jakarta",
                     label: "Plus Jakarta Sans",
                     sub: "Default — designed for readability"
                  },
                  {
                     value: "inter",
                     label: "Inter",
                     sub: "Clean and neutral — great on screens"
                  },
                  {
                     value: "system",
                     label: "System default",
                     sub: "Your device's native font"
                  }
               ]}
            />
         </SettingsGroup>

         <SettingsGroup
            title='Text size'
            footer='Affects body text throughout the app. Headings scale proportionally.'>
            <RadioGroup
               value={fontSize}
               onChange={setFontSize}
               options={[
                  {
                     value: "small",
                     label: "Small",
                     sub: "Fits more content — 14 px base"
                  },
                  {
                     value: "default",
                     label: "Default",
                     sub: "Balanced readability — 16 px"
                  },
                  {
                     value: "large",
                     label: "Large",
                     sub: "Easier to read — 18 px base"
                  }
               ]}
            />
         </SettingsGroup>

         {/* Desktop panels */}
         <SettingsGroup
            title='Desktop & panels'
            footer='The sidebar only appears on screens wide enough for it (lg and up). Panels are the queue and lyrics drawers.'>
            <SettingsRow
               label='Collapse sidebar'
               description={sidebarCollapsed ? 'Currently collapsed to icons' : 'Currently showing icons and labels'}
               onClick={toggleSidebar}>
               <span className='text-[13px] text-[var(--text-muted)]'>
                  {sidebarCollapsed ? 'Collapsed' : 'Expanded'}
               </span>
            </SettingsRow>
         </SettingsGroup>
      </div>
   );
}
