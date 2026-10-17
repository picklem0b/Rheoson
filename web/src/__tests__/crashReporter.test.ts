import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Crash reporter.
 *
 * The properties that matter are all about failure: a crash loop must not
 * queue hundreds of copies, a report must survive being offline, and one
 * unusable payload must not wedge the queue forever. Each is pinned below.
 */

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true })

vi.mock('@/api/client.api', () => ({
  getAuthHeader: vi.fn(async () => ({ Authorization: 'Bearer test' })),
}))

type Reporter = typeof import('@/lib/crashReporter')
let mod: Reporter

const QUEUE_KEY = 'rheoson-crash-queue'

function queue(): unknown[] {
  return JSON.parse(localStorageMock.getItem(QUEUE_KEY) ?? '[]')
}

beforeEach(async () => {
  localStorageMock.clear()
  vi.clearAllMocks()
  // The reporter dedupes per module instance, so each test gets its own.
  vi.resetModules()
  mod = await import('@/lib/crashReporter')
})

afterEach(() => {
  mod.stopCrashReporter()
})

describe('captureCrash', () => {
  it('queues a report when delivery is not possible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    mod.captureCrash(new Error('boom'), 'js')
    await new Promise(r => setTimeout(r, 0))
    expect(queue()).toHaveLength(1)
    expect((queue()[0] as { message: string }).message).toBe('boom')
  })

  it('reports the same crash once per session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    for (let i = 0; i < 50; i++) mod.captureCrash(new Error('render loop'), 'render')
    await new Promise(r => setTimeout(r, 0))
    expect(queue()).toHaveLength(1)
  })

  it('treats a different stack frame as a different crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const a = new Error('same message')
    a.stack = 'Error: same message\n    at A (a.tsx:1:1)'
    const b = new Error('same message')
    b.stack = 'Error: same message\n    at B (b.tsx:2:2)'
    mod.captureCrash(a, 'js')
    mod.captureCrash(b, 'js')
    await new Promise(r => setTimeout(r, 0))
    expect(queue()).toHaveLength(2)
  })

  it('never throws, even for a non-Error value', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(() => mod.captureCrash({ weird: true }, 'js')).not.toThrow()
    await new Promise(r => setTimeout(r, 0))
    expect(queue()).toHaveLength(1)
  })

  it('caps the queue so a crash loop cannot fill storage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    for (let i = 0; i < 60; i++) {
      const err = new Error(`crash ${i}`)
      err.stack = `Error: crash ${i}\n    at f${i} (x.tsx:${i}:1)`
      mod.captureCrash(err, 'js')
    }
    await new Promise(r => setTimeout(r, 0))
    expect(queue().length).toBeLessThanOrEqual(40)
  })
})

describe('flushCrashes', () => {
  it('posts queued reports and clears them on success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    mod.captureCrash(new Error('deliver me'), 'js')
    await new Promise(r => setTimeout(r, 0))

    await mod.flushCrashes()
    expect(fetchMock).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/diagnostics/crash')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ message: 'deliver me' })
    expect(queue()).toEqual([])
  })

  it('keeps reports queued when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    mod.captureCrash(new Error('keep me'), 'js')
    await new Promise(r => setTimeout(r, 0))
    await mod.flushCrashes()
    expect(queue()).toHaveLength(1)
  })

  it('keeps reports queued on a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    mod.captureCrash(new Error('server down'), 'js')
    await new Promise(r => setTimeout(r, 0))
    await mod.flushCrashes()
    expect(queue()).toHaveLength(1)
  })

  it('drops a report the server refuses, so one payload cannot wedge the queue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400 })))
    mod.captureCrash(new Error('malformed'), 'js')
    await new Promise(r => setTimeout(r, 0))
    await mod.flushCrashes()
    expect(queue()).toEqual([])
  })

  it('is a no-op with nothing queued', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await mod.flushCrashes()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('importNativeCrashes', () => {
  it('is a no-op without the native plugin', async () => {
    expect(await mod.importNativeCrashes()).toBe(0)
  })

  it('drains native traces into the queue as native crashes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const consume = vi.fn(async () => ({
      crashes: ['Native crash: java.lang.NullPointerException\n\tat com.lethabo.rheoson.MainActivity'],
    }))
    ;(window as unknown as { Capacitor?: unknown }).Capacitor = {
      Plugins: { CrashLog: { consume, clear: vi.fn() } },
    }
    try {
      expect(await mod.importNativeCrashes()).toBe(1)
      await new Promise(r => setTimeout(r, 0))
      const queued = queue()[0] as { kind: string; message: string }
      expect(queued.kind).toBe('native')
      expect(queued.message).toContain('NullPointerException')
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor
    }
  })

  it('survives a plugin that throws', async () => {
    const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor ?? {}
    cap.Plugins = cap.Plugins ?? {}
    cap.Plugins.CrashLog = { consume: vi.fn(async () => { throw new Error('bridge gone') }), clear: vi.fn() }
    ;(window as unknown as { Capacitor?: unknown }).Capacitor = cap
    try {
      expect(await mod.importNativeCrashes()).toBe(0)
    } finally {
      delete (window as unknown as { Capacitor?: unknown }).Capacitor
    }
  })
})

describe('initCrashReporter', () => {
  it('catches an unhandled rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    mod.initCrashReporter()
    const event = new Event('unhandledrejection') as Event & { reason?: unknown }
    event.reason = new Error('nope')
    window.dispatchEvent(event)
    await new Promise(r => setTimeout(r, 0))
    expect(queue().length).toBeGreaterThan(0)
  })

  it('ignores resource load failures, which are not crashes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    mod.initCrashReporter()
    window.dispatchEvent(new Event('error'))
    await new Promise(r => setTimeout(r, 0))
    expect(queue()).toEqual([])
  })

  it('initialises only once', () => {
    mod.initCrashReporter()
    expect(() => mod.initCrashReporter()).not.toThrow()
  })
})
