import { useCallback, useEffect, useRef, useState } from 'react'
import { searchApi, type SmartSearchResult } from '@/api/search.api'
import { usePlayerStore } from '@/store/player.store'
import { isOnline } from '@/lib/network'

/**
 * Natural-language search with context about what's playing.
 *
 * Typing "more like this" or "top 5 hip-hop this week" should work, and it
 * should work *about the current song* — so the hook reads the player store
 * and sends the playing track along with the query. The backend turns that
 * into an intent + real tracks (see services/smart_search.py).
 *
 * Voice input uses the Web Speech API when the platform provides it (Chrome
 * and the Android WebView do; Safari and Firefox often don't), and reports
 * `voiceSupported` so the UI can hide the mic instead of showing a dead
 * button.
 */

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null
  onerror: ((event: unknown) => void) | null
  onend: (() => void) | null
}

type SpeechCtor = new () => SpeechRecognitionLike

function getSpeechCtor(): SpeechCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor
    webkitSpeechRecognition?: SpeechCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSmartSearch() {
  const [result, setResult] = useState<SmartSearchResult | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const voiceSupported = getSpeechCtor() !== null

  // Stop listening if the component goes away mid-utterance.
  useEffect(() => () => recognitionRef.current?.stop(), [])

  const ask = useCallback(async (query: string) => {
    const q = query.trim()
    if (!q) return

    if (!isOnline()) {
      setError('Smart search needs a connection')
      return
    }

    setIsAsking(true)
    setError(null)

    // Context: whatever the app is playing right now.
    const current = usePlayerStore.getState().currentTrack
    try {
      const res = await searchApi.smartSearch(q, {
        track_id: current?.id,
        title: current?.title,
        artist: current?.artist?.name,
        page: window.location.pathname,
      })
      setResult(res)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Smart search failed — try again'
      )
      setResult(null)
    } finally {
      setIsAsking(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResult(null)
    setError(null)
    setTranscript('')
  }, [])

  const startVoice = useCallback(
    (onFinal: (text: string) => void) => {
      const Ctor = getSpeechCtor()
      if (!Ctor) return

      // Toggle off when already listening.
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
        setIsListening(false)
        return
      }

      const recognition = new Ctor()
      recognition.lang = navigator.language || 'en-US'
      recognition.continuous = false
      recognition.interimResults = true

      recognition.onresult = (event) => {
        let text = ''
        for (let i = 0; i < event.results.length; i += 1) {
          text += event.results[i][0]?.transcript ?? ''
        }
        setTranscript(text)
      }

      recognition.onerror = () => {
        setIsListening(false)
        recognitionRef.current = null
        setError('Couldn’t hear that — try again')
      }

      recognition.onend = () => {
        setIsListening(false)
        recognitionRef.current = null
        setTranscript((final) => {
          const value = final.trim()
          if (value) onFinal(value)
          return value
        })
      }

      recognitionRef.current = recognition
      setIsListening(true)
      setError(null)
      try {
        recognition.start()
      } catch {
        setIsListening(false)
        recognitionRef.current = null
      }
    },
    []
  )

  return {
    result,
    isAsking,
    error,
    ask,
    clear,
    // Voice
    voiceSupported,
    isListening,
    transcript,
    startVoice,
  }
}

export default useSmartSearch
