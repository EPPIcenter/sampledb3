import { useEffect } from 'react'
import { isTypingInInput } from './useHotkey'

/**
 * Hook to block some browser shortcuts when user is not typing
 * 
 * IMPORTANT: Modern browsers prevent JavaScript from blocking critical shortcuts
 * like Ctrl/Cmd+W (close tab), Ctrl/Cmd+N (new window), and Ctrl/Cmd+T (new tab)
 * for security and user experience reasons. These cannot be blocked.
 * 
 * This hook can only attempt to block non-critical shortcuts like find in page,
 * but even these may not work reliably across all browsers.
 * 
 * @param enabled - Set to false to disable browser shortcut blocking
 */
export function useBrowserShortcutBlocker(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Always allow if user is typing in an input
      if (isTypingInInput()) {
        return
      }

      const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
      const modifier = isMac ? event.metaKey : event.ctrlKey
      const shift = event.shiftKey
      const key = (event.key ?? '').toLowerCase() // eslint-disable-line @typescript-eslint/no-unnecessary-condition

      // Note: Critical browser shortcuts (Ctrl/Cmd+W, N, T) cannot be blocked
      // by JavaScript for security reasons. Only attempting to block find shortcuts.
      const shortcutsToBlock: Array<{ key: string; requiresShift?: boolean; description: string }> = [
        // Find shortcuts (we have our own search) - may not work reliably
        { key: 'f', description: 'Find in page' },
        { key: 'g', description: 'Find next' },
        { key: 'g', requiresShift: true, description: 'Find previous' },
      ]

      // Check if this is a shortcut we want to block
      const shouldBlock = shortcutsToBlock.some(shortcut => {
        // Check if shift requirement matches
        if (shortcut.requiresShift !== undefined) {
          if (shortcut.requiresShift && !shift) return false
          if (!shortcut.requiresShift && shift) return false
        } else if (shift) {
          // If shortcut doesn't require shift but shift is pressed, don't block
          return false
        }
        
        // Check if key matches
        return key === shortcut.key && modifier
      })

      if (shouldBlock && modifier) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        return false
      }
    }

    // Use capture phase to intercept before browser handles it
    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [enabled])
}

