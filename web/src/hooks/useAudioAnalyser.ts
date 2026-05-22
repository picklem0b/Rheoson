import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'

export function useAudioAnalyser(barCount = 32) {
  const [bars, setBars]     = useState<number[]>(new Array(barCount).fill(0))
  const analyser            = useRef<AnalyserNode | null>(null)
  const source              = useRef<MediaElementAudioSourceNode | null>(null)
  const context             = useRef<AudioContext | null>(null)
  const frame               = useRef<number | null>(null)
  const isPlaying           = usePlayerStore((s) => s.isPlaying)

  useEffect(() => {
    const audio = document.querySelector<HTMLAudioElement>('audio[data-howler]')
    if (!audio) return

    context.current  = new AudioContext()
    analyser.current = context.current.createAnalyser()
    analyser.current.fftSize = barCount * 2

    source.current = context.current.createMediaElementSource(audio)
    source.current.connect(analyser.current)
    analyser.current.connect(context.current.destination)

    return () => {
      frame.current && cancelAnimationFrame(frame.current)
      context.current?.close()
    }
  }, [barCount])

  useEffect(() => {
    if (!isPlaying || !analyser.current) {
      frame.current && cancelAnimationFrame(frame.current)
      setBars(new Array(barCount).fill(0))
      return
    }

    const data = new Uint8Array(analyser.current.frequencyBinCount)

    const tick = () => {
      analyser.current!.getByteFrequencyData(data)
      setBars(Array.from(data).map((v) => v / 255))
      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => { frame.current && cancelAnimationFrame(frame.current) }
  }, [isPlaying, barCount])

  return bars
}