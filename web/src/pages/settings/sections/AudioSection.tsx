import { useState } from 'react'
import { SettingsGroup, SettingsRow, Toggle, RadioGroup } from '../components/SettingsPrimitives'

type StreamQuality = 'low' | 'normal' | 'high' | 'very_high'

export default function AudioSection() {
  const [crossfade, setCrossfade] = useState(false)
  const [normalize, setNormalize] = useState(true)
  const [gapless, setGapless] = useState(true)
  const [quality, setQuality] = useState<StreamQuality>('very_high')

  return (
    <div className="pb-2">
      <SettingsGroup title="Playback">
        <SettingsRow
          label="Crossfade"
          description="Smooth transition between tracks — fades out the current and fades in the next"
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
          value={quality}
          onChange={setQuality}
          options={[
            { value: 'low',       label: 'Low',       sub: '128 kbps — saves data'            },
            { value: 'normal',    label: 'Normal',    sub: '192 kbps — balanced'              },
            { value: 'high',      label: 'High',      sub: '256 kbps — great quality'         },
            { value: 'very_high', label: 'Very High', sub: '320 kbps — best streaming quality' },
          ]}
        />
      </SettingsGroup>

      <SettingsGroup title="Equalizer">
        <SettingsRow label="Open equalizer" description="Fine-tune frequency bands" onClick={() => {}} />
        <SettingsRow label="Preset" value="Flat" onClick={() => {}} />
      </SettingsGroup>
    </div>
  )
}
