import { motion, AnimatePresence } from "framer-motion";
import { Check, Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/store/theme.store";
import { ACCENT_THEMES } from "@/themes";
import {
   SettingsGroup,
   SettingsRow,
   Slider
} from "../components/SettingsPrimitives";

export default function AppearanceSection() {
   const { theme, glassOpacity, setAccent, setSurface, setGlassOpacity } =
      useThemeStore();

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
                                    strokeWidth={3}
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

         {/* Fonts and navigation live in Layout — they are the only display
             controls with live consumers, so the old Display group (compact
             rows, artwork visibility, animation switch) was removed: none of
             those keys were read anywhere. */}
      </div>
   );
}
