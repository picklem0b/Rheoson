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

// ── Pure logic mirrored from useSearchHistory ─────────────────
const HISTORY_KEY = 'rheoson-search-history'
const MAX_HISTORY = 8

interface SearchHistoryTrack {
  id: string
  youtubeId: string
  title: string
  artistName: string
  artworkUrl: string
  duration: number
}

interface SearchHistoryEntry {
  query: string
  track: SearchHistoryTrack | null
  at: number
}

function readHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorageMock.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed
      .map((e): SearchHistoryEntry | null => {
        if (typeof e === 'string') return { query: e, track: null, at: now }
        if (e && typeof e === 'object' && typeof (e as Record<string, unknown>).query === 'string') {
          const entry = e as SearchHistoryEntry
          return { query: entry.query, track: entry.track ?? null, at: typeof entry.at === 'number' ? entry.at : now }
        }
        return null
      })
      .filter((e): e is SearchHistoryEntry => e !== null)
      .slice(0, MAX_HISTORY)
  } catch { return [] }
}

function writeHistory(history: SearchHistoryEntry[]) {
  try { localStorageMock.setItem(HISTORY_KEY, JSON.stringify(history)) } catch { /* quota exceeded — ignore */ }
}

function recordSearch(history: SearchHistoryEntry[], query: string): SearchHistoryEntry[] {
  const q = query.trim()
  if (!q || q.length < 2) return history
  const existing = history.find(e => e.query.toLowerCase() === q.toLowerCase())
  const next = [
    { query: existing?.query ?? q, track: existing?.track ?? null, at: Date.now() },
    ...history.filter(e => e.query.toLowerCase() !== q.toLowerCase()),
  ].slice(0, MAX_HISTORY)
  writeHistory(next)
  return next
}

function recordPlay(history: SearchHistoryEntry[], query: string, track: SearchHistoryTrack): SearchHistoryEntry[] {
  const q = query.trim()
  if (!q || q.length < 2) return history
  const snapshot = {
    id: track.id,
    youtubeId: track.youtubeId || track.id,
    title: track.title,
    artistName: track.artistName || 'Unknown Artist',
    artworkUrl: track.artworkUrl ?? '',
    duration: typeof track.duration === 'number' ? track.duration : 0,
  }
  const next = [
    { query: q, track: snapshot, at: Date.now() },
    ...history.filter(e => e.query.toLowerCase() !== q.toLowerCase()),
  ].slice(0, MAX_HISTORY)
  writeHistory(next)
  return next
}

function removeEntry(history: SearchHistoryEntry[], query: string): SearchHistoryEntry[] {
  const next = history.filter(e => e.query.toLowerCase() !== query.trim().toLowerCase())
  writeHistory(next)
  return next
}

const DNA: SearchHistoryTrack = {
  id: 'dna-vid', youtubeId: 'dna-vid', title: 'DNA.', artistName: 'Kendrick Lamar',
  artworkUrl: 'http://art/dna.jpg', duration: 339,
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
    history = recordSearch(history, 'kendrick lamar')
    expect(history).toHaveLength(1)
    expect(history[0].query).toBe('kendrick lamar')
    expect(history[0].track).toBeNull()
  })

  it('deduplicates queries (case-insensitive), keeping the song', () => {
    let history = readHistory()
    history = recordSearch(history, 'Kendrick Lamar')
    history = recordPlay(history, 'kendrick lamar', DNA)
    expect(history).toHaveLength(1)
    expect(history[0].query.toLowerCase()).toBe('kendrick lamar')
    expect(history[0].track?.title).toBe('DNA.')
  })

  it('most recent first', () => {
    let history = readHistory()
    history = recordSearch(history, 'first')
    history = recordSearch(history, 'second')
    expect(history.map(e => e.query)).toEqual(['second', 'first'])
  })

  it('respects max history limit of 8', () => {
    let history = readHistory()
    for (let i = 0; i < 15; i++) {
      history = recordSearch(history, `query ${i}`)
    }
    expect(history.length).toBe(MAX_HISTORY)
  })

  it('rejects short queries', () => {
    let history = readHistory()
    history = recordSearch(history, 'a')
    expect(history).toEqual([])
  })

  it('removes entries from history', () => {
    let history = readHistory()
    history = recordSearch(history, 'test query')
    history = removeEntry(history, 'TEST QUERY')
    expect(history).toEqual([])
  })

  it('records the song listened to after a query', () => {
    let history = readHistory()
    history = recordPlay(history, 'kendrick', DNA)
    expect(history).toHaveLength(1)
    expect(history[0].track).toMatchObject({
      title: 'DNA.',
      artistName: 'Kendrick Lamar',
      artworkUrl: 'http://art/dna.jpg',
    })
  })

  it('moving a search to the front keeps its song attached', () => {
    let history = readHistory()
    history = recordPlay(history, 'kendrick', DNA)
    history = recordSearch(history, 'beach house')
    history = recordSearch(history, 'kendrick')
    expect(history[0].query).toBe('kendrick')
    expect(history[0].track?.title).toBe('DNA.')
    expect(history).toHaveLength(2)
  })

  it('migrates legacy string[] history entries', () => {
    localStorageMock.setItem(HISTORY_KEY, JSON.stringify(['old query', 'another one']))
    const migrated = readHistory()
    expect(migrated).toHaveLength(2)
    expect(migrated[0].query).toBe('old query')
    expect(migrated[0].track).toBeNull()
  })
})
