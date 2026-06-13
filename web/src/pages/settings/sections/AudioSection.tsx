import { Sliders } from 'lucide-react'
import { usePersisted } from '@/hooks/usePersisted'
import { SettingsGroup, SettingsRow, Toggle, RadioGroup } from '../components/SettingsPrimitives'

export default function AudioSection() {
  const [crossfade, setCrossfade] = usePersisted('crossfade', false)
  const [normalize, setNormalize] = usePersisted('normalize', true)
  const [gapless,   setGapless]   = usePersisted('gapless', true)
  const [quality,   setQuality]   = usePersisted<string>('stream-quality', 'very_high')

  return (
    <div className="pb-2">
      <SettingsGroup title="Playback">
        <SettingsRow
          label="Crossfade"
          description="Smooth transition between tracks — fades out current, fades in next"
        >
          <Toggle value={crossfade} onChange={setCrossfade} />
        </SettingsRow>
        <SettingsRow
          label="Volume normalisation"
          description="Equalise loudness across all tracks"
        >
          <Toggle value={normalize} onChange={setNormalize} />
        </SettingsRow>
        <SettingsRow
          label="Gapless playback"
          description="Remove silence between consecutive tracks"
        >
          <Toggle value={gapless} onChange={setGapless} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Streaming quality">
        <RadioGroup
          value={quality as any}
          onChange={setQuality}
          options={[
            { value: 'low',       label: 'Low',       sub: '128 kbps — saves data'             },
            { value: 'normal',    label: 'Normal',    sub: '192 kbps — balanced'               },
            { value: 'high',      label: 'High',      sub: '256 kbps — great quality'          },
            { value: 'very_high', label: 'Very High', sub: '320 kbps — best streaming quality'  },
          ]}
        />
      </SettingsGroup>

      <SettingsGroup title="Equalizer">
        <SettingsRow
          label="Open equalizer"
          description="Fine-tune frequency bands"
          onClick={() => {}}
        >
          <Sliders className="w-4 h-4 text-[var(--text-muted)]" />
        </SettingsRow>
        <SettingsRow label="Preset" onClick={() => {}}>
          <span className="text-xs text-[var(--text-muted)] font-medium">Flat</span>
        </SettingsRow>
      </SettingsGroup>
    </div>
  )
}