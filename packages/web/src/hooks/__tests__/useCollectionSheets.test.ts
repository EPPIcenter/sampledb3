import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCollectionSheets } from '../useCollectionSheets'

const contents = (count: number) => ({ sheets: Array.from({ length: count }, (_, i) => ({ id: i + 1, papers: [] })) })

describe('useCollectionSheets', () => {
  it('expands every sheet when there are 3 or fewer', () => {
    const { result } = renderHook(() => useCollectionSheets(1, contents(3)))
    expect([...result.current.expandedSheets]).toEqual([1, 2, 3])
  })

  it('starts collapsed when there are more than 3 sheets', () => {
    const { result } = renderHook(() => useCollectionSheets(1, contents(4)))
    expect(result.current.expandedSheets.size).toBe(0)
  })

  it('waits for the sheets to load, then keeps the user toggles across refetches', () => {
    const { result, rerender } = renderHook(({ id, c }) => useCollectionSheets(id, c), {
      initialProps: { id: 1, c: undefined as ReturnType<typeof contents> | undefined },
    })
    expect(result.current.sheets).toEqual([])
    rerender({ id: 1, c: contents(2) })
    expect([...result.current.expandedSheets]).toEqual([1, 2])

    act(() => result.current.toggleSheet(1))
    expect([...result.current.expandedSheets]).toEqual([2])
    rerender({ id: 1, c: contents(2) })
    expect([...result.current.expandedSheets]).toEqual([2])
  })

  it('starts over for a different collection', () => {
    const { result, rerender } = renderHook(({ id, c }) => useCollectionSheets(id, c), {
      initialProps: { id: 1, c: contents(4) as ReturnType<typeof contents> | undefined },
    })
    act(() => result.current.toggleSheet(2))
    rerender({ id: 2, c: undefined })
    expect(result.current.expandedSheets.size).toBe(0)
    rerender({ id: 2, c: contents(1) })
    expect([...result.current.expandedSheets]).toEqual([1])
  })
})
