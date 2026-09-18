import { usePersisted } from "@/hooks/persisted.hook";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   Slider
} from "../components/SettingsPrimitives";
import {
   EQ_PRESETS,
   setEQPreset,
   applyFromStorage
} from "@/lib/audioEffects";
import { useToast } from "@/components/ui/Toaster";
import { haptic } from "@/lib/haptics";

/**
 * Audio settings — every control here is read live by the audio engine
 * (lib/audioEffects.ts) or the queue controller. Controls whose only
 * effect was writing an unread localStorage key were removed: a toggle
 * that does nothing is worse than no toggle.
 */
export default function AudioSection() {
   const [autoplay, setAutoplay] = usePersisted("autoplay", true);
   const [normalize, setNormalize] = usePersisted("normalize", true);
   const [eqPreset, setEqPreset] = usePersisted<string>("eq-preset", "Flat");
   const [bassBoost, setBassBoost] = usePersisted("bass-boost", false);
   const [mono, setMono] = usePersisted("mono", false);
   const [preAmpGain, setPreAmpGain] = usePersisted("pre-amp-gain", 0);
   const [gapless, setGapless] = usePersisted("gapless", true);
   const [seekStep, setSeekStep] = usePersisted("seek-step", 10);
   const [hapticsOn, setHapticsOn] = usePersisted("haptics-enabled", true);
   const { toast } = useToast();

   return (
      <div className='pb-4'>
         {/* Playback */}
         <SettingsGroup title='Playback'>
            <SettingsRow
               label='Autoplay'
               description='When your queue ends, keep playing similar music'>
               <Toggle value={autoplay} onChange={setAutoplay} />
            </SettingsRow>
            <SettingsRow
               label='Gapless queue'
               description='Warm upcoming tracks while you listen so skipping never waits'>
               <Toggle value={gapless} onChange={setGapless} />
            </SettingsRow>
            <Slider
               value={seekStep}
               onChange={setSeekStep}
               min={5}
               max={60}
               step={5}
               label='Seek step'
               formatValue={v => `${v} s`}
            />
            <SettingsRow
               label='Haptic feedback'
               description='Vibrate on play, pause, and skip on supported devices'
               onClick={() => {
                  setHapticsOn(true);
                  haptic('success');
                  toast('Haptics working', 'success', 1600);
               }}>
               <Toggle value={hapticsOn} onChange={setHapticsOn} />
            </SettingsRow>
         </SettingsGroup>

         {/* Volume — all four wired through applyFromStorage() */}
         <SettingsGroup
            title='Volume'
            footer='Normalisation and EQ apply to playback instantly.'>
            <SettingsRow
               label='Volume normalisation'
               description='Compress peaks so volume stays consistent across tracks'>
               <Toggle
                  value={normalize}
                  onChange={v => {
                     setNormalize(v)
                     applyFromStorage()
                  }}
               />
            </SettingsRow>
            <Slider
               value={preAmpGain}
               onChange={v => {
                  setPreAmpGain(v)
                  applyFromStorage()
               }}
               min={-12}
               max={12}
               step={0.5}
               label='Pre-amp gain'
               formatValue={v => `${v > 0 ? "+" : ""}${v} dB`}
            />
            <SettingsRow
               label='Bass boost'
               description='Boost low frequencies for a fuller, richer sound'>
               <Toggle
                  value={bassBoost}
                  onChange={v => {
                     setBassBoost(v)
                     applyFromStorage()
                  }}
               />
            </SettingsRow>
            <SettingsRow
               label='Mono output'
               description='Mix stereo to mono — useful with a single speaker'>
               <Toggle
                  value={mono}
                  onChange={v => {
                     setMono(v)
                     applyFromStorage()
                  }}
               />
            </SettingsRow>
         </SettingsGroup>

         {/* EQ */}
         <SettingsGroup
            title='Equaliser preset'
            footer='Applied instantly to playback. Fine-tune with the Equalizer panel in the player.'>
            {EQ_PRESETS.map(preset => (
               <SettingsRow
                  key={preset.id}
                  label={preset.name}
                  onClick={() => {
                     setEqPreset(preset.name)
                     setEQPreset(preset.id)
                  }}>
                  {eqPreset === preset.name && (
                     <span className='text-[var(--accent)] font-semibold text-[14px]'>
                        ✓
                     </span>
                  )}
               </SettingsRow>
            ))}
         </SettingsGroup>
      </div>
   );
}
