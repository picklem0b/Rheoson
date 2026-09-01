import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '@/store/player.store'

// fftSize must be a power of 2. We want at least barCount * 2 buckets.
function nearestPow2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

// Module-level: shared AudioContext + source node for both analyser and equalizer.
// Only one MediaElementSource can exist per <audio> element.
let _sharedCtx: AudioContext | null = null
let _sharedSource: MediaElementAudioSourceNode | null = null
let _sharedAnalyser: AnalyserNode | null = null
let _eqFilters: BiquadFilterNode[] | null = null

/**
 * Get or create the shared audio analysis chain.
 * Returns { analyser, source } so both useAudioAnalyser and EqualizerPanel
 * can coexist on the same audio element.
 */
export function getSharedAudioChain(): {
  ctx: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
} {
  if (_sharedCtx && _sharedSource && _sharedAnalyser) {
    return { ctx: _sharedCtx, source: _sharedSource, analyser: _sharedAnalyser }
  }

  const audio = document.querySelector<HTMLAudioElement>('audio[data-howler]')
  if (!audio) throw new Error('No Howler audio element found')

  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.75

  let source: MediaElementAudioSourceNode
  try {
    source = ctx.createMediaElementSource(audio)
  } catch {
    // Source already created by equalizer — reuse it
    source = _sharedSource!
  }

  // Build chain: source → analyser → destination
  // (EqualizerPanel inserts filters between source and analyser when active)
  source.connect(analyser)
  analyser.connect(ctx.destination)

  _sharedCtx = ctx
  _sharedSource = source
  _sharedAnalyser = analyser

  return { ctx, source, analyser }
}

/** Get the shared source node (returns null if not initialized) */
export function getSharedSource(): MediaElementAudioSourceNode | null {
  return _sharedSource
}

export function useAudioAnalyser(barCount = 32) {
  const [bars, setBars] = useState<number[]>(() => new Array(barCount).fill(0))

  const analyserRef = useRef<AnalyserNode | null>(null)
  const frameRef    = useRef<number | null>(null)

  const isPlaying = usePlayerStore((s) => s.isPlaying)

  // ── Setup AudioContext once ─────────────────────────────────

  useEffect(() => {
    try {
      const { analyser } = getSharedAudioChain()
      analyserRef.current = analyser
    } catch {
      // Audio element not ready yet — retry on next render
    }

    return () => {
      frameRef.current && cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // ── Animation loop ─────────────────────────────────────────

  useEffect(() => {
    const analyser = analyserRef.current

    if (!isPlaying || !analyser) {
      frameRef.current && cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      setBars(new Array(barCount).fill(0))
      return
    }

    // Resume context if suspended
    _sharedCtx?.state === 'suspended' && _sharedCtx.resume()

    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteFrequencyData(data)

      // Downsample to barCount buckets by averaging groups of bins
      const step   = Math.floor(data.length / barCount)
      const values = Array.from({ length: barCount }, (_, i) => {
        let sum = 0
        for (let j = 0; j < step; j++) sum += data[i * step + j]
        return sum / step / 255
      })

      setBars(values)
      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      frameRef.current && cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [isPlaying, barCount])

  return bars
}
