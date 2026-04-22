import { useEffect, type RefObject } from 'react'

/**
 * Calls onClose when the user clicks outside the element attached to ref.
 * Uses mousedown to avoid the same click that opened the dropdown from closing it.
 * Only active when enabled is true.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled) return

    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [ref, onClose, enabled])
}
