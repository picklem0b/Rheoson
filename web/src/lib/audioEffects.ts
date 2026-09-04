/**
 * Persistent audio-effects engine.
 *
 * All playback audio routes through ONE WebAudio graph owned by this module:
 *
 *   <audio data-howler> → MediaElementSource
 *     → preAmp (Gain, Settings "pre-amp gain")
 *     → EQ band filters (5-band; Settings preset / Equalizer panel)
 *     → bass lowshelf (Settings "bass boost")
 *     → compressor (Settings "volume normalisation")
 *     → master (mono down-mix when Settings "mono output")
 *     → analyser → destination
 *
 * The analyser tail is always in the chain, so the visualizer keeps working
 * and audio is never routed twice (single MediaElementSource rule). Nodes
 * are created once and mutated in place, so Settings and the Equalizer panel
 * take effect live and survive the panel being closed.
 *
 * Preferences are read from the same localStorage keys AudioSection writes.
 */

// ── Types & presets ───────────────────────────────────────────

export interface EQBand {
  freq: number
  gain: number
  type: BiquadFilterType
}

export interface EQPreset {
  id: string
  name: string
  gains: number[] // 5 bands: 60 / 230 / 910 / 3600 / 14000
}

export const EQ_BANDS: Omit<EQBand, 'gain'>[] = [
  { freq: 60,    type: 'lowshelf'  },
  { freq: 230,   type: 'peaking'   },
  { freq: 910,   type: 'peaking'   },
  { freq: 3600,  type: 'peaking'   },
  { freq: 14000, type: 'highshelf' },
]

// Canonical preset list — shared by Settings → Audio ("Equaliser preset")
// and the Equalizer panel so both surfaces stay in sync.
export const EQ_PRESETS: EQPreset[] = [
  { id: 'flat',       name: 'Flat',         gains: [0,  0,  0,  0,  0] },
  { id: 'bass',       name: 'Bass Boost',   gains: [8,  5,  0,  0,  0] },
  { id: 'treble',     name: 'Treble Boost', gains: [0,  0,  2,  5,  8] },
  { id: 'vocal',      name: 'Vocal',        gains: [-2, 2,  6,  4,  0] },
  { id: 'electronic', name: 'Electronic',   gains: [7,  2, -1,  3,  6] },
  { id: 'hiphop',     name: 'Hip-Hop',      gains: [9,  4,  1,  2,  3] },
  { id: 'rock',       name: 'Rock',         gains: [5,  3,  4,  5,  4] },
  { id: 'jazz',       name: 'Jazz',         gains: [3,  1,  2,  3,  4] },
  { id: 'classical',  name: 'Classical',    gains: [4,  2,  0, -1,  2] },
  { id: 'podcast',    name: 'Podcast',      gains: [-2, 3,  6,  4, -1] },
  { id: 'acoustic',   name: 'Acoustic',     gains: [3,  2,  3,  4,  5] },
  { id: 'loudness',   name: 'Loudness',     gains: [6,  2,  0,  2,  6] },
  { id: 'night',      name: 'Night Mode',   gains: [-4, -1, 2, -1, -3] },
]

// ── Graph state ───────────────────────────────────────────────

let _ctx: AudioContext | null = null
let _source: MediaElementAudioSourceNode | null = null
let _analyser: AnalyserNode | null = null
let _preAmp: GainNode | null = null
let _eqFilters: BiquadFilterNode[] = []
let _bass: BiquadFilterNode | null = null
let _comp: DynamicsCompressorNode | null = null
let _master: GainNode | null = null
let _el: HTMLAudioElement | null = null

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`rheoson-${key}`)
    return raw !== null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const dbToGain = (db: number) => Math.pow(10, db / 20)

// ── Chain construction (idempotent per element) ───────────────

/**
 * Attach the effects graph to the Howler <audio> element.
 * Safe to call repeatedly; returns the shared analyser (or null when no
 * element exists yet — e.g. nothing has played).
 */
export function ensureEffectsChain(el?: HTMLAudioElement | null): AnalyserNode | null {
  const audio = el ?? document.querySelector<HTMLAudioElement>('audio[data-howler]')
  if (!audio) return _analyser

  if (_ctx && _source && _el === audio) return _analyser

  _el = audio
  const ctx = new AudioContext()
  const source = ctx.createMediaElementSource(audio)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.75

  const preAmp = ctx.createGain()
  const bass = ctx.createBiquadFilter()
  bass.type = 'lowshelf'
  bass.frequency.value = 120
  bass.gain.value = 0

  const comp = ctx.createDynamicsCompressor()
  // Neutral defaults — real values applied by applyFromStorage()
  comp.threshold.value = -24
  comp.knee.value = 20
  comp.ratio.value = 1
  comp.attack.value = 0.01
  comp.release.value = 0.25

  const master = ctx.createGain()

  const eqFilters = EQ_BANDS.map((band) => {
    const f = ctx.createBiquadFilter()
    f.type = band.type
    f.frequency.value = band.freq
    f.gain.value = 0
    f.Q.value = 1.4
    return f
  })

  // source → preAmp → eq0 → … → eq4 → bass → comp → master → analyser → out
  source.connect(preAmp)
  let tail: AudioNode = preAmp
  for (const f of eqFilters) { tail.connect(f); tail = f }
  tail.connect(bass)
  tail = bass
  tail.connect(comp)
  tail = comp
  tail.connect(master)
  master.connect(analyser)
  analyser.connect(ctx.destination)

  _ctx = ctx
  _source = source
  _analyser = analyser
  _preAmp = preAmp
  _eqFilters = eqFilters
  _bass = bass
  _comp = comp
  _master = master

  applyFromStorage()

  // Resume when a user gesture is available (orchestrated by callers)
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return analyser
}

// ── Live parameter setters ────────────────────────────────────

function _applyGains(gains: number[]): void {
  _eqFilters.forEach((f, i) => {
    if (gains[i] !== undefined) f.gain.value = gains[i]
  })
}

/** Apply a preset's band gains (also persists the choice). */
export function setEQPreset(id: string): void {
  const preset = EQ_PRESETS.find((p) => p.id === id) ?? EQ_PRESETS[0]
  _applyGains(preset.gains)
  try {
    localStorage.setItem('rheoson-eq-preset', JSON.stringify(preset.name))
    localStorage.removeItem('rheoson-eq-bands')
  } catch { /* ignore */ }
}

/** Set the 5 band gains directly (Equalizer panel custom sliders). */
export function setBands(gains: number[]): void {
  _applyGains(gains)
  try {
    const flat = gains.every((g) => (g ?? 0) === 0)
    if (flat) {
      localStorage.removeItem('rheoson-eq-bands')
    } else {
      localStorage.setItem('rheoson-eq-bands', JSON.stringify(gains))
    }
    localStorage.removeItem('rheoson-eq-preset')
  } catch { /* ignore */ }
}

/** Band gains currently applied (for the panel's sliders). */
export function getBands(): number[] {
  return _eqFilters.map((f) => f.gain.value)
}

export function setBassBoost(on: boolean): void {
  if (!_bass) return
  _bass.gain.value = on ? 6 : 0
}

export function setMono(on: boolean): void {
  if (!_master) return
  _master.channelCount = on ? 1 : 2
  _master.channelCountMode = 'explicit'
  _master.channelInterpretation = 'speakers'
}

export function setPreAmp(db: number): void {
  if (!_preAmp) return
  _preAmp.gain.value = dbToGain(db)
}

export function setNormalize(on: boolean): void {
  if (!_comp) return
  // ratio 1 = passthrough; anything above actually compresses
  _comp.ratio.value = on ? 4 : 1
  _comp.threshold.value = on ? -24 : 0
}

/** Re-read all persisted Audio settings and apply them to the live graph. */
export function applyFromStorage(): void {
  const presetName = readPref<string>('eq-preset', 'Flat')
  const customBands = readPref<number[] | null>('eq-bands', null)

  if (customBands && customBands.length === 5) {
    _applyGains(customBands)
  } else {
    const preset = EQ_PRESETS.find((p) => p.name === presetName) ?? EQ_PRESETS[0]
    _applyGains(preset.gains)
  }
  setBassBoost(readPref('bass-boost', false))
  setMono(readPref('mono', false))
  setPreAmp(readPref('pre-amp-gain', 0))
  setNormalize(readPref('normalize', true))
}

/**
 * Central entry for analyser consumers (visualizer). Ensures the graph is
 * attached to the current Howl element and returns { ctx, source, analyser }.
 */
export function getSharedAudioNodes(): {
  ctx: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
} | null {
  const analyser = ensureEffectsChain()
  if (!analyser || !_ctx || !_source) return null
  return { ctx: _ctx, source: _source, analyser }
}
