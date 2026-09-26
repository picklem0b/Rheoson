import { describe, it, expect } from 'vitest'
import { splitErrorCode } from '@/api/client.api'

// The backend appends the registry code to user-facing failure strings:
//   "Download failed — … [ERR DEX01]"
// splitErrorCode is how the UI separates the sentence from the code so the
// chip renders it and the sentence stays clean.

describe('splitErrorCode', () => {
  it('splits the trailing [ERR DCCNN] suffix', () => {
    const { message, code } = splitErrorCode(
      'Download failed — the media server cut the transfer short. [ERR DEX01]'
    )
    expect(message).toBe(
      'Download failed — the media server cut the transfer short.'
    )
    expect(code).toBe('DEX01')
  })

  it('handles every domain letter and category pair', () => {
    for (const code of ['DEX01', 'ANF02', 'PVA03', 'SSE04', 'TIN99']) {
      const { code: c } = splitErrorCode(`Boom [ERR ${code}]`)
      expect(c).toBe(code)
      expect(c).toMatch(/^[A-Z]{3}\d{2}$/)
    }
  })
})

describe('splitErrorCode non-matches', () => {
  it('passes through details without a code suffix', () => {
    expect(splitErrorCode('Just a message')).toEqual({ message: 'Just a message' })
  })

  it('lowercase or malformed suffixes are not codes', () => {
    expect(splitErrorCode('Boom [ERR dex01]')).toEqual({ message: 'Boom [ERR dex01]' })
    expect(splitErrorCode('Boom [ERR DEX1]')).toEqual({ message: 'Boom [ERR DEX1]' })
    expect(splitErrorCode('Boom [ERR DEX012]')).toEqual({ message: 'Boom [ERR DEX012]' })
    expect(splitErrorCode('Boom [ERR DEX01')).toEqual({ message: 'Boom [ERR DEX01' })
  })

  it('does not match a code-like string in the middle of a sentence', () => {
    const { message, code } = splitErrorCode('See [ERR DEX01] for details')
    expect(message).toBe('See [ERR DEX01] for details')
    expect(code).toBeUndefined()
  })

  it('handles empty input without throwing', () => {
    expect(splitErrorCode('')).toEqual({ message: '' })
  })
})
