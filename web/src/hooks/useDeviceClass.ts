import { useCallback, useEffect, useMemo, useState } from 'react'
import { isNativePlatform } from '@/lib/capacitor'

/**
 * Device classification for the two-shell layout system.
 *
 * The desktop and mobile experiences are deliberately separate shells,
 * never a merged middle. Classification is a pure function of four
 * signals:
 *
 *   - pointer modality  (coarse = touch-first device)
 *   - viewport width    (breakpoint, updated on resize)
 *   - native shell      (the APK is always the mobile experience, even
 *     on a large Android tablet in landscape — by product decision)
 *   - installed context (PWA running in standalone display mode keeps
 *     the shell of the device class it is installed on)
 *
 * CSS breakpoints (640/768/1024/1280) match BREAKPOINTS in constants.
 */

export type DeviceWidth = 'compact' | 'medium' | 'wide'
export type DeviceClass = 'mobile' | 'tablet' | 'desktop'

export interface DeviceInfo {
  /** Primary input is a finger (touch-first), not a cursor. */
  coarsePointer: boolean
  width: DeviceWidth
  /** The Capacitor native shell — always rendered with the mobile experience. */
  native: boolean
  /** Running as an installed PWA (standalone display mode). */
  standalone: boolean
  /** The resolved experience shell. Consumers switch layout on this. */
  deviceClass: DeviceClass
}

const WIDTH_BREAKPOINTS = { compact: 768, medium: 1024 } as const

function readWidth(): DeviceWidth {
  const w = window.innerWidth
  if (w < WIDTH_BREAKPOINTS.compact) return 'compact'
  if (w < WIDTH_BREAKPOINTS.medium) return 'medium'
  return 'wide'
}

function readCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}

function readStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    // iOS Safari exposes installed-web-app state only through this
    // non-standard property.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function computeClass(coarse: boolean, width: DeviceWidth, native: boolean): DeviceClass {
  // Product rule: the native shell always gets the mobile experience.
  if (native) return 'mobile'
  if (width === 'wide') return 'desktop'
  // Narrow screens are the mobile shell regardless of pointer, so a small
  // desktop window still renders a sane touch-first layout.
  if (width === 'compact') return 'mobile'
  // Medium width: tablets are touch-first (mobile shell with expanded
  // columns); a narrow desktop window keeps the desktop shell because its
  // pointer stays fine.
  return coarse ? 'mobile' : 'desktop'
}

export function useDeviceClass(): DeviceInfo {
  const [width, setWidth] = useState<DeviceWidth>(readWidth)
  const [coarsePointer, setCoarsePointer] = useState<boolean>(readCoarsePointer)
  const [standalone, setStandalone] = useState<boolean>(readStandalone)
  const native = useMemo(() => isNativePlatform(), [])

  useEffect(() => {
    let raf = 0
    // rAF-batched so a resize storm (window drag, orientation change)
    // measures once per frame instead of once per event.
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setWidth(readWidth())
        setStandalone(readStandalone())
      })
    }
    const mq = window.matchMedia('(pointer: coarse)')
    const onPointerChange = (e: MediaQueryListEvent) => setCoarsePointer(e.matches)

    window.addEventListener('resize', onResize)
    mq.addEventListener('change', onPointerChange)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      mq.removeEventListener('change', onPointerChange)
    }
  }, [])

  const deviceClass = computeClass(coarsePointer, width, native)

  return { coarsePointer, width, native, standalone, deviceClass }
}

/**
 * Imperative counterpart for non-hook contexts (module code, class
 * utilities): re-derives the current shell on demand.
 */
export function currentDeviceClass(): DeviceClass {
  return computeClass(readCoarsePointer(), readWidth(), isNativePlatform())
}

/**
 * Stable feature checks used by components that only need a boolean
 * (e.g. "render hover affordances?"). Hook wrappers keep re-renders
 * honest; these are read-once helpers for one-shot decisions.
 */
export function useIsTouchDevice(): boolean {
  return useDeviceClass().coarsePointer
}

/**
 * Media-query hook for shell-internal responsive decisions that the
 * device class alone cannot express (e.g. tablet landscape).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * Returns a memoized callback-stable device info for contexts that must
 * not re-render children on every resize tick (layout providers).
 */
export function useDeviceInfoMemo(): DeviceInfo {
  const info = useDeviceClass()
  const { coarsePointer, width, native, standalone, deviceClass } = info
  return useMemo(
    () => ({ coarsePointer, width, native, standalone, deviceClass }),
    [coarsePointer, width, native, standalone, deviceClass]
  )
}

// Re-exported so shell components can check orientation without knowing
// the exact query strings.
export const ORIENTATION_QUERIES = {
  portrait: '(orientation: portrait)',
  landscape: '(orientation: landscape)',
} as const

export function useOrientation(): 'portrait' | 'landscape' {
  const portrait = useMediaQuery(ORIENTATION_QUERIES.portrait)
  return portrait ? 'portrait' : 'landscape'
}

// Convenience for keyboard-shortcut surfaces: desktop-shell-only behavior
// should consult this rather than raw width so the APK never enables it.
export function useIsDesktopShell(): boolean {
  const { deviceClass } = useDeviceClass()
  const isDesktop = useCallback(() => deviceClass === 'desktop', [deviceClass])
  return isDesktop()
}
