import { useState, useCallback } from 'react'

const HISTORY_KEY = 'rheoson-search-history'
const MAX_HISTORY = 10

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch { /* quota exceeded — ignore */ }
}

/**
 * useSearchHistory — manages recent search queries with deduplication.
 * Most recent first. Max 10 entries.
 */
// Settings → Privacy → "Save search history" off: keep showing previously
// saved queries but stop adding new ones.
function searchLoggingEnabled(): boolean {
  try {
    const raw = localStorage.getItem('rheoson-save-search-log')
    return raw === null ? true : JSON.parse(raw) === true
  } catch {
    return true
  }
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(readHistory)

  const addQuery = useCallback((query: string) => {
    const q = query.trim()
    if (!q || q.length < 2 || !searchLoggingEnabled()) return

    setHistory(prev => {
      // Deduplicate and add to front
      const filtered = prev.filter(h => h.toLowerCase() !== q.toLowerCase())
      const next = [q, ...filtered].slice(0, MAX_HISTORY)
      writeHistory(next)
      return next
    })
  }, [])

  const removeQuery = useCallback((query: string) => {
    setHistory(prev => {
      const next = prev.filter(h => h !== query)
      writeHistory(next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    writeHistory([])
  }, [])

  return { history, addQuery, removeQuery, clearHistory }
}
