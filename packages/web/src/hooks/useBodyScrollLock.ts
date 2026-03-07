import { useEffect } from 'react'

/**
 * Locks body scroll when enabled is true (e.g. when a modal is open).
 * Restores overflow on cleanup or when enabled becomes false.
 */
export function useBodyScrollLock(enabled: boolean): void {
  useEffect(() => {
    if (enabled) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [enabled])
}
