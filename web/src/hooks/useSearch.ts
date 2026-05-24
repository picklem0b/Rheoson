import { useState, useEffect, useCallback, useRef } from 'react'
import { searchApi } from '@/api/search'
import type { SearchResults, SearchFilter } from '@/types/search'
import { detectInputType } from '@/lib/utils'

const DEBOUNCE_MS   = 200    // faster than before
const SUGGEST_MS    = 80     // near-instant for suggestions

export function useSearch() {
  const [query,       setQuery]       = useState('')
  const [filter,      setFilter]      = useState<SearchFilter>('all')
  const [results,     setResults]     = useState<SearchResults | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading,   setLoading]     = useState(false)
  const [isSuggesting,setSuggesting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const searchTimer  = useRef<number | null>(null)
  const suggestTimer = useRef<number | null>(null)

  // ── Suggestions (instant, no filter) ─────────────────────
  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)

    const q = query.trim()
    if (!q || q.length < 2 || detectInputType(q) !== 'query') {
      setSuggestions([])
      return
    }

    suggestTimer.current = window.setTimeout(async () => {
      setSuggesting(true)
      try {
        const data = await searchApi.getSuggestions(q)
        setSuggestions(data)
      } catch {
        setSuggestions([])
      } finally {
        setSuggesting(false)
      }
    }, SUGGEST_MS)

    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current) }
  }, [query])

  // ── Full search (debounced) ───────────────────────────────
  const doSearch = useCallback(async (q: string, f: SearchFilter) => {
    if (!q.trim()) { setResults(null); return }

    setLoading(true)
    setError(null)

    try {
      const type = detectInputType(q)

      if (type === 'spotify' || type === 'youtube') {
        const resolved = await searchApi.resolve(q)
        const tracks   = Array.isArray(resolved)
          ? resolved
          : (resolved as any).tracks ?? [resolved]
        setResults({ tracks, albums: [], artists: [], playlists: [], query: q })
      } else {
        const data = await searchApi.search(q, f !== 'all' ? f : undefined)
        setResults(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(
      () => doSearch(query, filter),
      DEBOUNCE_MS
    )
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, filter, doSearch])

  const clear = useCallback(() => {
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
    query, setQuery,
    filter, setFilter,
    results, isLoading,
    suggestions, isSuggesting,
    error, clear, selectSuggestion,
  }
}