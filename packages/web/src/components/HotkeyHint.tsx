import { formatHotkey, getModifierKey } from '../lib/hotkeys'

interface HotkeyHintProps {
  keys: string
  className?: string
}

/**
 * Component to display a hotkey hint (e.g., "⌘N" or "Ctrl+N")
 */
export default function HotkeyHint({ keys, className = '' }: HotkeyHintProps) {
  // Replace platform-specific modifiers
  const normalizedKeys = keys
    .replace(/\bcmd\b/gi, getModifierKey())
    .replace(/\bctrl\b/gi, getModifierKey())
    .replace(/\bmeta\b/gi, getModifierKey())

  const formatted = formatHotkey(normalizedKeys)

  return (
    <span className={`text-xs text-gray-400 ml-2 ${className}`} aria-label={`Keyboard shortcut: ${formatted}`}>
      ({formatted})
    </span>
  )
}

