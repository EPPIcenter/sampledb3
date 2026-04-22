import { useState, useEffect } from 'react'

/**
 * Returns a value that updates only after the input has been stable for delayMs.
 * Useful for search/filter inputs to avoid triggering fetches or layout updates on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}
