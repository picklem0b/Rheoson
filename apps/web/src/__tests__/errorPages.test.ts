import { describe, it, expect } from 'vitest'
import {
  ERROR_PAGES,
  FALLBACK_ERROR_PAGE,
  errorPageFor,
} from '@/lib/errorPages'

// ── Data-driven config contract ──────────────────────────────

describe('ERROR_PAGES config', () => {
  it('covers every state the spec requires', () => {
    for (const status of [404, 401, 403, 429, 500, 502, 503, 504]) {
      expect(ERROR_PAGES[status], `missing ${status}`).toBeTruthy()
    }
  })

  it('every entry is complete and internally consistent', () => {
    for (const [key, cfg] of Object.entries(ERROR_PAGES)) {
      expect(cfg.status, `status mismatch for ${key}`).toBe(Number(key))
      expect(cfg.label.length).toBeGreaterThan(0)
      expect(cfg.title.length).toBeGreaterThan(0)
      expect(cfg.subtitle.length).toBeGreaterThan(0)
      expect(cfg.label).toBe(cfg.label.toUpperCase())
    }
  })

  it('the spec signature copy is present', () => {
    expect(ERROR_PAGES[404].subtitle).toBe(
      "We couldn't find the page you're looking for."
    )
    expect(ERROR_PAGES[401].subtitle).toBe('You need to sign in first.')
    expect(ERROR_PAGES[403].subtitle).toBe("You can't go there.")
    expect(ERROR_PAGES[429].subtitle).toBe('Whoa, slow down.')
    expect(ERROR_PAGES[500].subtitle).toBe('Something broke.')
    expect(ERROR_PAGES[502].subtitle).toBe("The server isn't talking to us.")
    expect(ERROR_PAGES[503].subtitle).toBe("We'll be back shortly.")
    expect(ERROR_PAGES[504].subtitle).toBe('The server took too long.')
  })

  it('each supported state has distinct title/subtitle (no generic reuse)', () => {
    const entries = Object.values(ERROR_PAGES)
    const titles = new Set(entries.map(e => e.title))
    const subtitles = new Set(entries.map(e => e.subtitle))
    expect(titles.size).toBe(entries.length)
    expect(subtitles.size).toBe(entries.length)
  })
})

describe('errorPageFor fallback', () => {
  it('unknown codes fall back to the 500-shaped generic', () => {
    expect(errorPageFor(418)).toEqual(FALLBACK_ERROR_PAGE)
    expect(errorPageFor(999)).toEqual(FALLBACK_ERROR_PAGE)
  })

  it('missing/invalid input falls back (never throws)', () => {
    expect(errorPageFor(undefined)).toEqual(FALLBACK_ERROR_PAGE)
    expect(errorPageFor(null)).toEqual(FALLBACK_ERROR_PAGE)
    expect(errorPageFor(0)).toEqual(FALLBACK_ERROR_PAGE)
  })

  it('known codes return their own entry', () => {
    expect(errorPageFor(404)).toEqual(ERROR_PAGES[404])
    expect(errorPageFor(503)).toEqual(ERROR_PAGES[503])
  })

  it('fallback is complete even though it is not in the registry', () => {
    expect(FALLBACK_ERROR_PAGE.status).toBe(500)
    expect(FALLBACK_ERROR_PAGE.title).toBeTruthy()
    expect(FALLBACK_ERROR_PAGE.subtitle).toBeTruthy()
    expect(FALLBACK_ERROR_PAGE.label).toBeTruthy()
  })
})
