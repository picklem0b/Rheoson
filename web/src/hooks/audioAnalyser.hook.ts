import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '@/store/player.store'
import { getSharedAudioNodes } from '@/lib/audioEffects'

/**
 * Visualizer access to the shared audio graph.
 *
 * The graph itself (source → effects → analyser → destination) is owned by
 * lib/audioEffects so Settings EQ/bass/mono/pre-amp/normalisation and the
 * Equalizer panel share a single MediaElementSource. This hook only reads
 * the analyser node and drives the animation loop.
 */

/** Get the shared { ctx, source, analyser } from the effects engine. */
export function getSharedAudioChain(): {
  ctx: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
} {
  const nodes = getSharedAudioNodes()
  if (!nodes) throw new Error('No Howler audio element found')
  return nodes
}

/** Get the shared source node (null if the graph isn't attached yet). */
export function getSharedSource(): MediaElementAudioSourceNode | null {
  return getSharedAudioNodes()?.source ?? null
}

export function useAudioAnalyser(barCount = 32) {
  const [bars, setBars] = useState<number[]>(() => new Array(barCount).fill(0))

  const analyserRef = useRef<AnalyserNode | null>(null)
  const frameRef    = useRef<number | null>(null)

  const isPlaying = usePlayerStore((s) => s.isPlaying)

  // ── Grab the analyser once the graph exists ─────────────────

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
    const ctx = analyser.context as AudioContext
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

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
