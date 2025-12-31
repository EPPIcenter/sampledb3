import { useEffect, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { getModifierKey } from '../lib/hotkeys'

interface UseHotkeyOptions {
  enabled?: boolean
  preventDefault?: boolean
  enableOnFormTags?: boolean
  enableOnContentEditable?: boolean
  stopPropagation?: boolean
}

/**
 * Check if the user is currently typing in an input field
 * This helps determine if we should block browser shortcuts
 */
export function isTypingInInput(): boolean {
  const activeElement = document.activeElement
  if (!activeElement) return false

  const tagName = activeElement.tagName.toLowerCase()
  const isInput = tagName === 'input' || tagName === 'textarea'
  const isContentEditable = activeElement.getAttribute('contenteditable') === 'true'
  
  // Check if it's a search input (we might want to allow browser find in some cases)
  const isSearchInput = activeElement.getAttribute('type') === 'search'
  
  // Don't block if user is actively typing in an input/textarea
  // But do block if it's just focused (not actively typing)
  return isInput || isContentEditable
}

/**
 * Check if we should block browser shortcuts in the current context
 */
export function shouldBlockBrowserShortcuts(): boolean {
  // Don't block if user is actively typing
  if (isTypingInInput()) {
    return false
  }
  
  // Block browser shortcuts when user is interacting with the app
  return true
}

/**
 * Custom hook wrapper around react-hotkeys-hook with app-specific defaults
 * 
 * @param keys - Hotkey combination (e.g., 'ctrl+k', 'g d', 'escape')
 * @param callback - Function to call when hotkey is pressed
 * @param options - Additional options
 */
export function useHotkey(
  keys: string,
  callback: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {}
) {
  const {
    enabled = true,
    preventDefault = true,
    stopPropagation = true,
    enableOnFormTags = false,
    enableOnContentEditable = false,
  } = options

  // Replace platform-specific modifiers
  const normalizedKeys = keys
    .replace(/\bcmd\b/gi, getModifierKey())
    .replace(/\bctrl\b/gi, getModifierKey())
    .replace(/\bmeta\b/gi, getModifierKey())

  useHotkeys(
    normalizedKeys,
    (event) => {
      // Only block if we're not in an input field (unless explicitly enabled)
      if (!enableOnFormTags && isTypingInInput()) {
        return
      }

      if (preventDefault) {
        event.preventDefault()
      }
      if (stopPropagation) {
        event.stopPropagation()
      }
      callback(event)
    },
    {
      enabled,
      enableOnFormTags,
      enableOnContentEditable,
      // Removed scopes - react-hotkeys-hook works globally by default
      // Using scopes requires HotkeysProvider which we don't need for global hotkeys
    }
  )
}

/**
 * Hook for handling modifier key combinations
 * Automatically handles both Cmd (Mac) and Ctrl (Windows/Linux)
 */
export function useModifierHotkey(
  key: string,
  callback: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {}
) {
  const modifier = getModifierKey()
  const hotkey = `${modifier}+${key}`
  useHotkey(hotkey, callback, options)
}

/**
 * Hook for handling modifier + shift combinations
 */
export function useModifierShiftHotkey(
  key: string,
  callback: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {}
) {
  const modifier = getModifierKey()
  const hotkey = `${modifier}+shift+${key}`
  useHotkey(hotkey, callback, options)
}

