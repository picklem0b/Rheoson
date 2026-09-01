import { describe, it, expect } from 'vitest'
import { formatDuration, formatFileSize, formatRelativeTime, formatCount, formatTrackCount, truncate, capitalize, formatTotalDuration } from '@/lib/formatters'

describe('formatDuration', () => {
  it('formats seconds to mm:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(125)).toBe('2:05')
  })

  it('formats hours correctly', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatDuration(7200)).toBe('2:00:00')
  })

  it('handles NaN and zero', () => {
    expect(formatDuration(NaN)).toBe('0:00')
    expect(formatDuration(0)).toBe('0:00')
  })

  it('pads single digits', () => {
    expect(formatDuration(61)).toBe('1:01')
    expect(formatDuration(3605)).toBe('1:00:05')
  })
})

describe('formatFileSize', () => {
  it('formats bytes to human readable', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
    expect(formatFileSize(1073741824)).toBe('1.0 GB')
  })
})

describe('formatCount', () => {
  it('formats large numbers', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1000)).toBe('1.0K')
    expect(formatCount(1500)).toBe('1.5K')
    expect(formatCount(1000000)).toBe('1.0M')
  })
})

describe('formatTrackCount', () => {
  it('uses singular for 1', () => {
    expect(formatTrackCount(1)).toBe('1 track')
  })

  it('uses plural for >1', () => {
    expect(formatTrackCount(0)).toBe('0 tracks')
    expect(formatTrackCount(5)).toBe('5 tracks')
  })
})

describe('truncate', () => {
  it('returns original if short enough', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates long strings', () => {
    expect(truncate('hello world', 5)).toBe('hello…')
  })
})

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello')
    expect(capitalize('')).toBe('')
  })
})

describe('formatTotalDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatTotalDuration(3660)).toBe('1 hr 1 min')
    expect(formatTotalDuration(7200)).toBe('2 hr 0 min')
  })

  it('formats minutes only', () => {
    expect(formatTotalDuration(120)).toBe('2 min')
  })
})
