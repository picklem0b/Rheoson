import { useState, useCallback } from 'react'

/**
 * Like useState but persists to localStorage.
 * Key is prefixed with "shulker-" automatically.
 */
export function usePersisted<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`shulker-${key}`)
      return raw !== null ? JSON.parse(raw) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const set = useCallback((v: T) => {
    setValue(v)
    try {
      localStorage.setItem(`shulker-${key}`, JSON.stringify(v))
    } catch {}
  }, [key])

  return [value, set]
}