import { useState, useCallback } from 'react'

const HISTORY_KEY = 'rheoson-search-history'

/**
 * How many recent searches to remember.
 * Each entry shows the song the user ended up listening to from that
 * search — the query alone is not very useful a day later.
 */
export const MAX_HISTORY = 8

/** Slim, playable snapshot of the song listened to after a search. */
export interface SearchHistoryTrack {
   id: string
   youtubeId: string
   title: string
   artistName: string
   artworkUrl: string
   duration: number
}

export interface SearchHistoryEntry {
   /** The search query the user typed (kept so it can be re-searched). */
   query: string
   /** The song played from that search's results — null if nothing was played. */
   track: SearchHistoryTrack | null
   /** Unix ms timestamp of the latest activity on this entry. */
   at: number
}

function isEntry(v: unknown): v is SearchHistoryEntry {
   return (
      !!v &&
      typeof v === 'object' &&
      typeof (v as Record<string, unknown>).query === 'string'
   )
}

function readHistory(): SearchHistoryEntry[] {
   try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []

      const now = Date.now()
      return parsed
         .map((e): SearchHistoryEntry | null => {
            // Legacy format (≤ v2.13): plain query strings
            if (typeof e === 'string') {
               return { query: e, track: null, at: now }
            }
            if (isEntry(e)) {
               return {
                  query: e.query,
                  track: e.track ?? null,
                  at: typeof e.at === 'number' ? e.at : now
               }
            }
            return null
         })
         .filter((e): e is SearchHistoryEntry => e !== null)
         .slice(0, MAX_HISTORY)
   } catch {
      return []
   }
}

function writeHistory(history: SearchHistoryEntry[]) {
   try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
   } catch {
      /* quota exceeded — ignore */
   }
}

/**
 * Settings → Privacy → "Save search history" off: stop recording new
 * entries (previously saved ones stay visible until cleared).
 */
function searchLoggingEnabled(): boolean {
   try {
      const raw = localStorage.getItem('rheoson-save-search-log')
      return raw === null ? true : JSON.parse(raw) === true
   } catch {
      return true
   }
}

export function useSearchHistory() {
   const [history, setHistory] = useState<SearchHistoryEntry[]>(readHistory)

   /**
    * Record that a search ran. Creates the entry (or bumps it to the
    * front, keeping any song already attached to it).
    */
   const recordSearch = useCallback((query: string) => {
      const q = query.trim()
      if (!q || q.length < 2 || !searchLoggingEnabled()) return

      setHistory(prev => {
         const existing = prev.find(e => e.query.toLowerCase() === q.toLowerCase())
         const next = [
            {
               query: existing?.query ?? q,
               track: existing?.track ?? null,
               at: Date.now()
            },
            ...prev.filter(e => e.query.toLowerCase() !== q.toLowerCase())
         ].slice(0, MAX_HISTORY)
         writeHistory(next)
         return next
      })
   }, [])

   /**
    * Record that the user played `track` from the results of `query`.
    * Moves the entry to the front and attaches the song so history
    * returns what was listened to, not just the raw query.
    */
   const recordPlay = useCallback((query: string, track: SearchHistoryTrack) => {
      const q = query.trim()
      if (!q || q.length < 2 || !searchLoggingEnabled()) return

      const snapshot: SearchHistoryTrack = {
         id: track.id,
         youtubeId: track.youtubeId || track.id,
         title: track.title,
         artistName: track.artistName || 'Unknown Artist',
         artworkUrl: track.artworkUrl ?? '',
         duration: typeof track.duration === 'number' ? track.duration : 0
      }

      setHistory(prev => {
         const next = [
            { query: q, track: snapshot, at: Date.now() },
            ...prev.filter(e => e.query.toLowerCase() !== q.toLowerCase())
         ].slice(0, MAX_HISTORY)
         writeHistory(next)
         return next
      })
   }, [])

   /** Remove a single entry (case-insensitive match on the query). */
   const removeEntry = useCallback((query: string) => {
      setHistory(prev => {
         const next = prev.filter(e => e.query.toLowerCase() !== query.trim().toLowerCase())
         writeHistory(next)
         return next
      })
   }, [])

   const clearHistory = useCallback(() => {
      setHistory([])
      writeHistory([])
   }, [])

   return { history, recordSearch, recordPlay, removeEntry, clearHistory }
}
