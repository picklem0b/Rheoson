import { useState, useEffect, useCallback, useRef } from 'react'
import { searchApi, resolveToTracks } from '@/api/search'
import { isAbortError } from '@/api/client'
import type { SearchResults, SearchFilter } from '@/types/search'
import { detectInputType } from '@/lib/utils'

const DEBOUNCE_MS = 200
const SUGGEST_MS  = 80

// Persist last query so Search page restores state when you navigate back
const SESSION_KEY = 'shulker-last-search'

function readSession(): { query: string; filter: SearchFilter } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : { query: '', filter: 'all' }
  } catch {
    return { query: '', filter: 'all' }
  }
}

function writeSession(query: string, filter: SearchFilter) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ query, filter }))
  } catch {}
}

export function useSearch() {
  const saved = readSession()

  const [query,        setQueryState]  = useState(saved.query)
  const [filter,       setFilterState] = useState<SearchFilter>(saved.filter)
  const [results,      setResults]     = useState<SearchResults | null>(null)
  const [suggestions,  setSuggestions] = useState<string[]>([])
  const [isLoading,    setLoading]     = useState(false)
  const [isSuggesting, setSuggesting]  = useState(false)
  const [error,        setError]       = useState<string | null>(null)

  const searchAbort  = useRef<AbortController | null>(null)
  const suggestAbort = useRef<AbortController | null>(null)
  const searchTimer  = useRef<number | null>(null)
  const suggestTimer = useRef<number | null>(null)

  const setQuery = useCallback((q: string) => {
    setQueryState(q)
    // Clear suggestions immediately when query changes —
    // prevents stale suggestions showing over new results
    if (!q) setSuggestions([])
  }, [])

  const setFilter = useCallback((f: SearchFilter) => {
    setFilterState(f)
  }, [])

  // ── Suggestions ───────────────────────────────────────────
  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    suggestAbort.current?.abort()

    const q = query.trim()

    // Suppress suggestions when results are already shown —
    // this was the "still suggesting" bug: results arrived but
    // suggestions stayed open because we never cleared them.
    if (!q || q.length < 2 || detectInputType(q) !== 'query' || results) {
      setSuggestions([])
      return
    }

    suggestTimer.current = window.setTimeout(async () => {
      const ctrl = new AbortController()
      suggestAbort.current = ctrl
      setSuggesting(true)
      try {
        const data = await searchApi.getSuggestions(q, ctrl.signal)
        setSuggestions(data)
      } catch (e) {
        if (!isAbortError(e)) setSuggestions([])
      } finally {
        setSuggesting(false)
      }
    }, SUGGEST_MS)

    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current)
      suggestAbort.current?.abort()
    }
  }, [query, results])

  // ── Full search ───────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()

    const q = query.trim()

    if (!q) {
      setResults(null)
      setError(null)
      writeSession('', filter)
      return
    }

    searchTimer.current = window.setTimeout(async () => {
      const ctrl = new AbortController()
      searchAbort.current = ctrl

      setLoading(true)
      setError(null)

      try {
        const type = detectInputType(q)
        let data: SearchResults

        if (type === 'spotify' || type === 'youtube') {
          const resolved = await searchApi.resolve(q, ctrl.signal)
          const tracks   = resolveToTracks(resolved)
          data = { tracks, albums: [], artists: [], playlists: [], query: q }
        } else {
          data = await searchApi.search(
            q,
            filter !== 'all' ? filter : undefined,
            ctrl.signal,
          )
        }

        setResults(data)
        // Clear suggestions once real results land
        setSuggestions([])
        writeSession(q, filter)
      } catch (e) {
        if (!isAbortError(e)) {
          setError(e instanceof Error ? e.message : 'Search failed')
          setResults(null)
        }
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchAbort.current?.abort()
    }
  }, [query, filter])

  const clear = useCallback(() => {
    searchAbort.current?.abort()
    suggestAbort.current?.abort()
    setQueryState('')
    setResults(null)
    setSuggestions([])
    setError(null)
    writeSession('', 'all')
  }, [])

  const selectSuggestion = useCallback((s: string) => {
    setQueryState(s)
    setSuggestions([])
  }, [])

  return {
    query,        setQuery,
    filter,       setFilter,
    results,      isLoading,
    suggestions,  isSuggesting,
    error,
    clear,
    selectSuggestion,
  }
}