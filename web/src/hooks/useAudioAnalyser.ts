import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'

// fftSize must be a power of 2. We want at least barCount * 2 buckets.
function nearestPow2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

// Module-level flag so we never call createMediaElementSource twice
// on the same <audio> element (throws InvalidStateError if you do).
let _sourceNode: MediaElementAudioSourceNode | null = null

export function useAudioAnalyser(barCount = 32) {
  const [bars, setBars] = useState<number[]>(() => new Array(barCount).fill(0))

  const analyserRef = useRef<AnalyserNode | null>(null)
  const contextRef  = useRef<AudioContext | null>(null)
  const frameRef    = useRef<number | null>(null)

  const isPlaying = usePlayerStore((s) => s.isPlaying)

  // ── Setup AudioContext once ─────────────────────────────────

  useEffect(() => {
    const audio = document.querySelector<HTMLAudioElement>('audio[data-howler]')
    if (!audio) return

    // Guard: AudioContext is already set up (strict mode double-invoke, HMR, etc.)
    if (contextRef.current) return

    const ctx      = new AudioContext()
    const analyser = ctx.createAnalyser()

    // fftSize must be a power of 2 and at least twice barCount
    analyser.fftSize        = nearestPow2(Math.max(barCount * 2, 32))
    analyser.smoothingTimeConstant = 0.75  // smooth but responsive

    contextRef.current  = ctx
    analyserRef.current = analyser

    // Reuse the existing source node if one was already created
    if (!_sourceNode) {
      _sourceNode = ctx.createMediaElementSource(audio)
    }
    _sourceNode.connect(analyser)
    analyser.connect(ctx.destination)

    return () => {
      frameRef.current && cancelAnimationFrame(frameRef.current)
      // Don't close the context here — it would break playback.
      // The context lives as long as the app; only clean up on full unmount.
    }
  }, [barCount])

  // ── Animation loop ─────────────────────────────────────────

  useEffect(() => {
    const analyser = analyserRef.current

    if (!isPlaying || !analyser) {
      frameRef.current && cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      setBars(new Array(barCount).fill(0))
      return
    }

    // Resume context if suspended (browsers suspend on page load until user gesture)
    contextRef.current?.state === 'suspended' && contextRef.current.resume()

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
