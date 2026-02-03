import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFloatingButtonsPosition } from '../useFloatingButtonsPosition'

describe('useFloatingButtonsPosition', () => {
  it('returns false (buttons always at bottom)', () => {
    const { result } = renderHook(() => useFloatingButtonsPosition())
    expect(result.current).toBe(false)
  })
})
