import { describe, it, expect } from 'vitest'
import { splitErrorCode } from '@/api/client.api'

// The backend appends the registry code to user-facing failure strings:
//   "Download failed — … [ERROR_CODE: DEX01]"
// splitErrorCode is how the UI separates the sentence from the code so the
// chip renders it and the sentence stays clean.

describe('splitErrorCode', () => {
  it('splits the trailing [ERROR_CODE: DCCNN] chip', () => {
    const { message, code } = splitErrorCode(
      'Download failed — the media server cut the transfer short. [ERROR_CODE: DEX01]'
    )
    expect(message).toBe(
      'Download failed — the media server cut the transfer short.'
    )
    expect(code).toBe('DEX01')
  })

  it('handles every domain letter and category pair', () => {
    for (const code of ['DEX01', 'ANF02', 'PVA03', 'SSE04', 'TIN99']) {
      const { code: c } = splitErrorCode(`Boom [ERROR_CODE: ${code}]`)
      expect(c).toBe(code)
      expect(c).toMatch(/^[A-Z]{3}\d{2}$/)
    }
  })
})

describe('splitErrorCode non-matches', () => {
  it('passes through details without a code suffix', () => {
    expect(splitErrorCode('Just a message')).toEqual({ message: 'Just a message' })
  })

  it('still accepts the legacy [ERR DCCNN] renderings across an upgrade', () => {
    expect(splitErrorCode('Boom [ERR DEX01]')).toEqual({ message: 'Boom', code: 'DEX01' })
    expect(splitErrorCode('Boom [ERR: DEX01]')).toEqual({ message: 'Boom', code: 'DEX01' })
  })

  it('lowercase or malformed suffixes are not codes', () => {
    expect(splitErrorCode('Boom [ERROR_CODE: dex01]')).toEqual({ message: 'Boom [ERROR_CODE: dex01]' })
    expect(splitErrorCode('Boom [ERROR_CODE: DEX1]')).toEqual({ message: 'Boom [ERROR_CODE: DEX1]' })
    expect(splitErrorCode('Boom [ERROR_CODE: DEX012]')).toEqual({ message: 'Boom [ERROR_CODE: DEX012]' })
    expect(splitErrorCode('Boom [ERROR_CODE: DEX01')).toEqual({ message: 'Boom [ERROR_CODE: DEX01' })
  })

  it('does not match a code-like string in the middle of a sentence', () => {
    const { message, code } = splitErrorCode('See [ERROR_CODE: DEX01] for details')
    expect(message).toBe('See [ERROR_CODE: DEX01] for details')
    expect(code).toBeUndefined()
  })

  it('handles empty input without throwing', () => {
    expect(splitErrorCode('')).toEqual({ message: '' })
  })
})
