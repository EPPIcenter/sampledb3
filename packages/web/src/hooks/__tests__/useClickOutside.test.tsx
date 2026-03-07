import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useClickOutside } from '../useClickOutside'

describe('useClickOutside', () => {
  beforeEach(() => {
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds mousedown listener when enabled', () => {
    const ref = { current: document.createElement('div') }
    const onClose = vi.fn()

    const { unmount } = renderHook(() => useClickOutside(ref, onClose, true))

    expect(document.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function))

    unmount()

    expect(document.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function))
  })

  it('does not add listener when disabled', () => {
    const ref = { current: document.createElement('div') }
    const onClose = vi.fn()

    renderHook(() => useClickOutside(ref, onClose, false))

    const addListener = document.addEventListener as ReturnType<typeof vi.fn>
    const mousedownCalls = addListener.mock.calls.filter((c: unknown[]) => c[0] === 'mousedown')
    expect(mousedownCalls.length).toBe(0)
  })

  it('calls onClose when click is outside ref element', () => {
    const ref = { current: document.createElement('div') }
    const onClose = vi.fn()

    renderHook(() => useClickOutside(ref, onClose, true))

    const addListener = document.addEventListener as ReturnType<typeof vi.fn>
    const handler = addListener.mock.calls.find((c: unknown[]) => c[0] === 'mousedown')?.[1] as (e: MouseEvent) => void

    const outsideTarget = document.createElement('span')
    document.body.appendChild(outsideTarget)
    const event = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(event, 'target', { value: outsideTarget })

    handler(event)

    expect(onClose).toHaveBeenCalledTimes(1)
    document.body.removeChild(outsideTarget)
  })

  it('does not call onClose when click is inside ref element', () => {
    const ref = { current: document.createElement('div') }
    const inner = document.createElement('span')
    ref.current.appendChild(inner)
    const onClose = vi.fn()

    renderHook(() => useClickOutside(ref, onClose, true))

    const addListener = document.addEventListener as ReturnType<typeof vi.fn>
    const handler = addListener.mock.calls.find((c: unknown[]) => c[0] === 'mousedown')?.[1] as (e: MouseEvent) => void

    const event = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(event, 'target', { value: inner })

    handler(event)

    expect(onClose).not.toHaveBeenCalled()
  })
})
