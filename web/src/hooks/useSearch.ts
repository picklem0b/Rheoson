import { useState, useEffect, useCallback, useRef } from 'react'
import { searchApi } from '@/api/search'
import type { SearchResults, SearchFilter } from '@/types/search'
import { detectInputType } from '@/lib/utils'

const DEBOUNCE_MS = 350

export function useSearch() {
  const [query, setQuery]       = useState('')
  const [filter, setFilter]     = useState<SearchFilter>('all')
  const [results, setResults]   = useState<SearchResults | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const doSearch = useCallback(async (q: string, f: SearchFilter) => {
    if (!q.trim()) { setResults(null); return }

    setLoading(true)
    setError(null)

    try {
      const type = detectInputType(q)

      if (type === 'spotify' || type === 'youtube') {
        const resolved = await searchApi.resolve(q)
        const tracks = Array.isArray(resolved) ? resolved : [resolved]
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
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => doSearch(query, filter), DEBOUNCE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query, filter, doSearch])

  const clear = useCallback(() => {
    setQuery('')
    setResults(null)
    setError(null)
  }, [])

  return { query, setQuery, filter, setFilter, results, isLoading, error, clear }
}