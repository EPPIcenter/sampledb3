import { describe, it, expect } from 'vitest'
import { CONTAINER_TYPES } from '../container-types'

describe('container-types', () => {
  it('exports expected container type values', () => {
    const values = CONTAINER_TYPES.map((c) => c.value)
    expect(values).toContain('paper')
    expect(values).toContain('cryovial_tube')
    expect(values).toContain('micronix_tube')
    expect(values).toContain('static_well')
  })
  it('each entry has label', () => {
    for (const c of CONTAINER_TYPES) {
      expect(c.label).toBeDefined()
      expect(typeof c.label).toBe('string')
    }
  })
})
