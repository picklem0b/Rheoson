import { useState, useEffect, useCallback, useRef } from 'react'
import { searchApi, resolveToTracks } from '@/api/search'
import { isAbortError } from '@/api/client'
import type { SearchResults, SearchFilter } from '@/types/search'
import { detectInputType } from '@/lib/utils'

const DEBOUNCE_MS  = 200  // full search debounce
const SUGGEST_MS   =  80  // suggestion debounce (near-instant)

export function useSearch() {
  const [query,        setQuery]        = useState('')
  const [filter,       setFilter]       = useState<SearchFilter>('all')
  const [results,      setResults]      = useState<SearchResults | null>(null)
  const [suggestions,  setSuggestions]  = useState<string[]>([])
  const [isLoading,    setLoading]      = useState(false)
  const [isSuggesting, setSuggesting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // AbortControllers to cancel in-flight requests on new keystrokes
  const searchAbort  = useRef<AbortController | null>(null)
  const suggestAbort = useRef<AbortController | null>(null)

  const searchTimer  = useRef<number | null>(null)
  const suggestTimer = useRef<number | null>(null)

  // ── Suggestions (near-instant, no filter) ────────────────

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    suggestAbort.current?.abort()

    const q = query.trim()
    if (!q || q.length < 2 || detectInputType(q) !== 'query') {
      setSuggestions([])
      return
    }

    suggestTimer.current = window.setTimeout(async () => {
      const controller = new AbortController()
      suggestAbort.current = controller

      setSuggesting(true)
      try {
        const data = await searchApi.getSuggestions(q, controller.signal)
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
  }, [query])

  // ── Full search (debounced) ───────────────────────────────
  // doSearch is NOT memoised with useCallback + deps because that
  // causes the effect below to re-run when doSearch identity changes,
  // creating a double-search on filter change.  Instead we read query
  // and filter directly inside the effect.

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchAbort.current?.abort()

    const q = query.trim()
    if (!q) { setResults(null); setError(null); return }

    searchTimer.current = window.setTimeout(async () => {
      const controller = new AbortController()
      searchAbort.current = controller

      setLoading(true)
      setError(null)

      try {
        const type = detectInputType(q)

        if (type === 'spotify' || type === 'youtube') {
          const resolved = await searchApi.resolve(q, controller.signal)
          const tracks   = resolveToTracks(resolved)
          setResults({ tracks, albums: [], artists: [], playlists: [], query: q })
        } else {
          const data = await searchApi.search(
            q,
            filter !== 'all' ? filter : undefined,
            controller.signal,
          )
          setResults(data)
        }
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
  }, [query, filter]) // both tracked — filter change fires a new search correctly

  // ── Actions ───────────────────────────────────────────────

  const clear = useCallback(() => {
    searchAbort.current?.abort()
    suggestAbort.current?.abort()
    setQuery('')
    setResults(null)
    setSuggestions([])
    setError(null)
  }, [])

  const selectSuggestion = useCallback((suggestion: string) => {
    setQuery(suggestion)
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
