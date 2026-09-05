import { usePersisted } from "@/hooks/persisted.hook";
import {
   SettingsGroup,
   SettingsRow,
   Toggle,
   RadioGroup,
   Slider
} from "../components/SettingsPrimitives";
import {
   EQ_PRESETS,
   setEQPreset,
   applyFromStorage
} from "@/lib/audioEffects";

export default function AudioSection() {
   const [crossfade, setCrossfade] = usePersisted("crossfade", false);
   const [crossfadeSecs, setCrossfadeSecs] = usePersisted("crossfade-secs", 5);
   const [normalize, setNormalize] = usePersisted("normalize", true);
   const [gapless, setGapless] = usePersisted("gapless", true);
   const [autoplay, setAutoplay] = usePersisted("autoplay", true);
   const [quality, setQuality] = usePersisted<string>(
      "stream-quality",
      "very_high"
   );
   const [eqPreset, setEqPreset] = usePersisted<string>("eq-preset", "Flat");
   const [bassBoost, setBassBoost] = usePersisted("bass-boost", false);
   const [mono, setMono] = usePersisted("mono", false);
   const [preAmpGain, setPreAmpGain] = usePersisted("pre-amp-gain", 0);

   return (
      <div className='pb-4'>
         {/* Playback */}
         <SettingsGroup title='Playback'>
            <SettingsRow
               label='Crossfade'
               description='Smoothly blend between tracks as they transition'>
               <Toggle value={crossfade} onChange={setCrossfade} />
            </SettingsRow>
            {crossfade && (
               <Slider
                  value={crossfadeSecs}
                  onChange={setCrossfadeSecs}
                  min={1}
                  max={12}
                  step={1}
                  label='Crossfade duration'
                  formatValue={v => `${v}s`}
               />
            )}
            <SettingsRow
               label='Gapless playback'
               description='Remove silence between consecutive tracks'>
               <Toggle value={gapless} onChange={setGapless} />
            </SettingsRow>
            <SettingsRow
               label='Autoplay'
               description='When your queue ends, keep playing similar music'>
               <Toggle value={autoplay} onChange={setAutoplay} />
            </SettingsRow>
         </SettingsGroup>

         {/* Streaming quality */}
         <SettingsGroup
            title='Streaming quality'
            footer='Higher quality uses more data and takes longer to start. Very High is recommended on Wi-Fi.'>
            <RadioGroup
               value={quality as "low" | "normal" | "high" | "very_high"}
               onChange={setQuality}
               options={[
                  {
                     value: "low",
                     label: "Low",
                     sub: "~128 kbps · saves mobile data"
                  },
                  {
                     value: "normal",
                     label: "Normal",
                     sub: "~192 kbps · balanced"
                  },
                  {
                     value: "high",
                     label: "High",
                     sub: "~256 kbps · great quality"
                  },
                  {
                     value: "very_high",
                     label: "Very High",
                     sub: "~320 kbps · best streaming quality"
                  }
               ]}
            />
         </SettingsGroup>

         {/* Volume */}
         <SettingsGroup title='Volume'>
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
