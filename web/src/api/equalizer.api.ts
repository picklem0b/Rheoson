import { api } from './client.api'

export interface EQBand {
  freq: number
  gain: number
  type: string
}

export interface EQPresetSummary {
  id: string
  name: string
  description: string
}

export interface EQPreset extends EQPresetSummary {
  bands: EQBand[]
}

export const equalizerApi = {
  getPresets: () =>
    api.get<{ presets: EQPresetSummary[] }>('/equalizer/presets'),

  getPreset: (id: string) =>
    api.get<EQPreset>(`/equalizer/presets/${id}`),
}
