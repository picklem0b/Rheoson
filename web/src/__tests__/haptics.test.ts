import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { haptic, cancelHaptic, isHapticSupported } from '@/lib/haptics'

describe('haptics', () => {
  let vibrateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // jsdom doesn't have navigator.vibrate — mock it
    vibrateSpy = vi.fn()
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls navigator.vibrate with correct pattern', () => {
    haptic('light')
    expect(vibrateSpy).toHaveBeenCalledWith(10)
  })

  it('calls navigator.vibrate with success pattern', () => {
    haptic('success')
    expect(vibrateSpy).toHaveBeenCalledWith([10, 30, 10])
  })

  it('calls navigator.vibrate with error pattern', () => {
    haptic('error')
    expect(vibrateSpy).toHaveBeenCalledWith([40, 80, 40, 80, 40])
  })

  it('cancelHaptic stops vibration', () => {
    cancelHaptic()
    expect(vibrateSpy).toHaveBeenCalledWith(0)
  })

  it('reports support status', () => {
    expect(typeof isHapticSupported()).toBe('boolean')
  })
})
