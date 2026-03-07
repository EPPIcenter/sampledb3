import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBodyScrollLock } from '../useBodyScrollLock'

describe('useBodyScrollLock', () => {
  const originalOverflow = document.body.style.overflow

  afterEach(() => {
    document.body.style.overflow = originalOverflow
  })

  it('sets body overflow hidden when enabled', () => {
    renderHook(() => useBodyScrollLock(true))

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body overflow when disabled', () => {
    const { rerender } = renderHook(({ enabled }) => useBodyScrollLock(enabled), {
      initialProps: { enabled: true },
    })

    expect(document.body.style.overflow).toBe('hidden')

    rerender({ enabled: false })

    expect(document.body.style.overflow).toBe('')
  })

  it('restores body overflow on unmount', () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true))

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('')
  })
})
