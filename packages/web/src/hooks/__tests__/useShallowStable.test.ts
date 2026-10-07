import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useShallowStable } from '../useShallowStable'

describe('useShallowStable', () => {
  it('keeps the first object while a fresh one has the same fields', () => {
    const fn = () => {}
    const { result, rerender } = renderHook(({ value }) => useShallowStable(value), {
      initialProps: { value: { a: 1, fn } },
    })
    const first = result.current
    rerender({ value: { a: 1, fn } })
    expect(result.current).toBe(first)
  })

  it('returns the new object when a field changes', () => {
    const { result, rerender } = renderHook(({ value }) => useShallowStable(value), {
      initialProps: { value: { a: 1 } as Record<string, number> },
    })
    const changed = { a: 2 }
    rerender({ value: changed })
    expect(result.current).toBe(changed)
    rerender({ value: { a: 2 } })
    expect(result.current).toBe(changed)
    const added = { a: 2, b: 3 }
    rerender({ value: added })
    expect(result.current).toBe(added)
  })
})
