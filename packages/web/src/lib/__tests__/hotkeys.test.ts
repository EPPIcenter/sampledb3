import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatHotkey, getModifierKey, isMac } from '../hotkeys'

describe('hotkeys', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    vi.stubGlobal('navigator', originalNavigator)
  })

  it('formatHotkey replaces meta with symbol on Mac', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(formatHotkey('meta+k')).toContain('⌘')
  })

  it('formatHotkey replaces ctrl with Ctrl on non-Mac', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(formatHotkey('ctrl+k')).toContain('Ctrl')
  })

  it('getModifierKey returns meta when Mac', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(getModifierKey()).toBe('meta')
  })

  it('getModifierKey returns ctrl when not Mac', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(getModifierKey()).toBe('ctrl')
  })

  it('isMac returns boolean', () => {
    expect(typeof isMac()).toBe('boolean')
  })
})
