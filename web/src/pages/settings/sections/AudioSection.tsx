import { usePersisted } from "@/hooks/persisted.hook";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   Slider
} from "../components/SettingsPrimitives";
import {
   EQ_PRESETS,
   applyFromStorage,
   setEQPreset
} from "@/lib/audioEffects";

/**
 * Audio — sound quality and output shaping only.
 *
 * Transport behaviour (speed, gapless, seek step, haptics) moved to the
 * Playback section; autoplay moved to Streaming. What stays here is the
 * signal chain: normalisation, pre-amp, bass boost, mono and the EQ.
 */
export default function AudioSection() {
   const [normalize, setNormalize] = usePersisted("normalize", true);
   const [eqPreset, setEqPreset] = usePersisted<string>("eq-preset", "Flat");
   const [bassBoost, setBassBoost] = usePersisted("bass-boost", false);
   const [mono, setMono] = usePersisted("mono", false);
   const [preAmpGain, setPreAmpGain] = usePersisted("pre-amp-gain", 0);

   return (
      <div className='pb-4'>
         {/* Volume — all four wired through applyFromStorage() */}
         <SettingsGroup
            title='Quality'
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
