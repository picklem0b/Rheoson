import { describe, it, expect } from 'vitest'
import { cn, uid, clamp, shuffle, isSpotifyUrl, isYouTubeUrl, detectInputType, parseSpotifyUrl, parseYouTubeUrl } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    const result = cn('foo', 'bar')
    expect(result).toContain('foo')
    expect(result).toContain('bar')
  })

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'extra')
    expect(result).toContain('base')
    expect(result).not.toContain('hidden')
    expect(result).toContain('extra')
  })
})

describe('uid', () => {
  it('generates unique IDs', () => {
    const id1 = uid()
    const id2 = uid()
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^id_/)
  })

  it('respects prefix', () => {
    const id = uid('dl')
    expect(id).toMatch(/^dl_/)
  })
})

describe('clamp', () => {
  it('clamps values within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('shuffle', () => {
  it('returns same length array', () => {
    const arr = [1, 2, 3, 4, 5]
    const shuffled = shuffle(arr)
    expect(shuffled).toHaveLength(arr.length)
  })

  it('does not mutate original', () => {
    const arr = [1, 2, 3]
    const original = [...arr]
    shuffle(arr)
    expect(arr).toEqual(original)
  })

  it('contains same elements', () => {
    const arr = [1, 2, 3, 4, 5]
    const shuffled = shuffle(arr)
    expect(shuffled.sort()).toEqual(arr.sort())
  })
})

describe('isSpotifyUrl', () => {
  it('detects Spotify URLs', () => {
    expect(isSpotifyUrl('https://open.spotify.com/track/123')).toBe(true)
    expect(isSpotifyUrl('https://open.spotify.com/album/123')).toBe(true)
    expect(isSpotifyUrl('https://open.spotify.com/playlist/123')).toBe(true)
    expect(isSpotifyUrl('https://open.spotify.com/artist/123')).toBe(true)
  })

  it('rejects non-Spotify URLs', () => {
    expect(isSpotifyUrl('https://youtube.com/watch?v=123')).toBe(false)
    expect(isSpotifyUrl('https://example.com')).toBe(false)
    expect(isSpotifyUrl('not a url')).toBe(false)
  })
})

describe('isYouTubeUrl', () => {
  it('detects YouTube URLs', () => {
    expect(isYouTubeUrl('https://youtube.com/watch?v=123')).toBe(true)
    expect(isYouTubeUrl('https://youtu.be/123')).toBe(true)
  })

  it('rejects non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://spotify.com/track/123')).toBe(false)
    expect(isYouTubeUrl('https://example.com')).toBe(false)
  })
})

describe('detectInputType', () => {
  it('detects Spotify links', () => {
    expect(detectInputType('https://open.spotify.com/track/abc')).toBe('spotify')
  })

  it('detects YouTube links', () => {
    expect(detectInputType('https://youtube.com/watch?v=abc')).toBe('youtube')
  })

  it('detects plain text as query', () => {
    expect(detectInputType('kendrick lamar')).toBe('query')
    expect(detectInputType('')).toBe('query')
  })
})

describe('parseSpotifyUrl', () => {
  it('extracts type and ID', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/track/abc123')).toEqual({ type: 'track', id: 'abc123' })
    expect(parseSpotifyUrl('https://open.spotify.com/album/xyz789')).toEqual({ type: 'album', id: 'xyz789' })
  })

  it('returns null for invalid URLs', () => {
    expect(parseSpotifyUrl('https://example.com')).toBeNull()
    expect(parseSpotifyUrl('not a url')).toBeNull()
  })
})

describe('parseYouTubeUrl', () => {
  it('extracts video ID from standard URLs', () => {
    expect(parseYouTubeUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts video ID from short URLs', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('returns null for invalid URLs', () => {
    expect(parseYouTubeUrl('https://example.com')).toBeNull()
  })
})
