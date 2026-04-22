import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBrowserShortcutBlocker } from '../useBrowserShortcutBlocker'

describe('useBrowserShortcutBlocker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds keydown listener when enabled', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() => useBrowserShortcutBlocker(true))

    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true })

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true })

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('does not add listener when disabled', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')

    renderHook(() => useBrowserShortcutBlocker(false))

    const keydownCalls = addSpy.mock.calls.filter((c) => c[0] === 'keydown')
    expect(keydownCalls.length).toBe(0)

    addSpy.mockRestore()
  })

  it('prevents default for modifier+f when not typing in input', () => {
    renderHook(() => useBrowserShortcutBlocker(true))

    const event = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
    })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

    document.dispatchEvent(event)

    expect(preventDefaultSpy).toHaveBeenCalled()
  })
})
