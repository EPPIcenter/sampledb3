/**
 * Hotkey constants and utilities
 */

export const HOTKEY_MODIFIER = {
  MAC: 'meta',
  WINDOWS: 'ctrl',
} as const

/**
 * Check if the current platform is Mac
 */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
}

/**
 * Get the appropriate modifier key for the current platform
 */
export function getModifierKey(): 'meta' | 'ctrl' {
  return isMac() ? 'meta' : 'ctrl'
}

/**
 * Format hotkey for display (e.g., "⌘K" or "Ctrl+K")
 */
export function formatHotkey(keys: string): string {
  if (isMac()) {
    return keys
      .replace(/meta/gi, '⌘')
      .replace(/ctrl/gi, '⌃')
      .replace(/shift/gi, '⇧')
      .replace(/alt/gi, '⌥')
      .replace(/option/gi, '⌥')
      .replace(/enter/gi, '↵')
      .replace(/escape/gi, '⎋')
      .replace(/backspace/gi, '⌫')
      .replace(/arrowup/gi, '↑')
      .replace(/arrowdown/gi, '↓')
      .replace(/arrowleft/gi, '←')
      .replace(/arrowright/gi, '→')
  }
  return keys
    .replace(/meta/gi, 'Ctrl')
    .replace(/ctrl/gi, 'Ctrl')
    .replace(/shift/gi, 'Shift')
    .replace(/alt/gi, 'Alt')
    .replace(/enter/gi, 'Enter')
    .replace(/escape/gi, 'Esc')
    .replace(/backspace/gi, 'Backspace')
    .replace(/arrowup/gi, '↑')
    .replace(/arrowdown/gi, '↓')
    .replace(/arrowleft/gi, '←')
    .replace(/arrowright/gi, '→')
}

/**
 * Hotkey definitions grouped by category
 */
export interface HotkeyDefinition {
  keys: string
  description: string
  category: string
  context?: string // Optional context where this hotkey is available
}

export const HOTKEY_DEFINITIONS: HotkeyDefinition[] = [
  // Command System
  {
    keys: `${getModifierKey()}+k`,
    description: 'Open search modal',
    category: 'Command System',
  },
  {
    keys: `${getModifierKey()}+shift+k`,
    description: 'Open command palette',
    category: 'Command System',
  },
  {
    keys: '?',
    description: 'Show keyboard shortcuts',
    category: 'Command System',
  },
  // Forms & Modals
  {
    keys: `${getModifierKey()}+enter`,
    description: 'Submit form or confirm action',
    category: 'Forms',
  },
  {
    keys: 'escape',
    description: 'Close modal or cancel action',
    category: 'Forms',
  },
  // Data Tables
  {
    keys: 'arrowup',
    description: 'Navigate to previous row',
    category: 'Data Tables',
    context: 'DataTable component',
  },
  {
    keys: 'arrowdown',
    description: 'Navigate to next row',
    category: 'Data Tables',
    context: 'DataTable component',
  },
  {
    keys: 'enter',
    description: 'Select row / Open detail page',
    category: 'Data Tables',
    context: 'DataTable component',
  },
]

