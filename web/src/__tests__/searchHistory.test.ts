import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Inline the logic from useSearchHistory for testing
const HISTORY_KEY = 'rheoson-search-history'
const MAX_HISTORY = 10

function readHistory(): string[] {
  try {
    const raw = localStorageMock.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeHistory(history: string[]) {
  try { localStorageMock.setItem(HISTORY_KEY, JSON.stringify(history)) } catch {}
}

function addQuery(history: string[], query: string): string[] {
  const q = query.trim()
  if (!q || q.length < 2) return history
  const filtered = history.filter(h => h.toLowerCase() !== q.toLowerCase())
  const next = [q, ...filtered].slice(0, MAX_HISTORY)
  writeHistory(next)
  return next
}

function removeQuery(history: string[], query: string): string[] {
  const next = history.filter(h => h !== query)
  writeHistory(next)
  return next
}

describe('search history', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('starts with empty history', () => {
    expect(readHistory()).toEqual([])
  })

  it('adds queries to history', () => {
    let history = readHistory()
    history = addQuery(history, 'kendrick lamar')
    expect(history).toEqual(['kendrick lamar'])
  })

  it('deduplicates queries (case-insensitive)', () => {
    let history = readHistory()
    history = addQuery(history, 'Kendrick Lamar')
    history = addQuery(history, 'kendrick lamar')
    expect(history).toEqual(['kendrick lamar'])
  })

  it('most recent first', () => {
    let history = readHistory()
    history = addQuery(history, 'first')
    history = addQuery(history, 'second')
    expect(history).toEqual(['second', 'first'])
  })

  it('respects max history limit', () => {
    let history = readHistory()
    for (let i = 0; i < 15; i++) {
      history = addQuery(history, `query ${i}`)
    }
    expect(history.length).toBe(MAX_HISTORY)
  })

  it('rejects short queries', () => {
    let history = readHistory()
    history = addQuery(history, 'a')
    expect(history).toEqual([])
  })

  it('removes queries from history', () => {
    let history = readHistory()
    history = addQuery(history, 'test query')
    history = removeQuery(history, 'test query')
    expect(history).toEqual([])
  })
})
