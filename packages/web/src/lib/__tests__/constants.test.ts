import { describe, it, expect } from 'vitest'
import { TUTORIAL_SHORT_CODE_PREFIX } from '../constants'

describe('constants', () => {
  it('TUTORIAL_SHORT_CODE_PREFIX is TUT', () => {
    expect(TUTORIAL_SHORT_CODE_PREFIX).toBe('TUT')
  })
})
