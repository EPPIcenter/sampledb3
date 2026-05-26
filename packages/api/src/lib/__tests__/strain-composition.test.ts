import { describe, it, expect } from 'bun:test'
import {
  strainCompositionMatches,
  targetDensityMatches,
  definitionCompositionMatches,
  normalizeStoredStrains,
} from '../controls/strain-composition'

describe('normalizeStoredStrains', () => {
  it('handles numeric and object entries', () => {
    expect(normalizeStoredStrains([1, { id: 2, percentage: 50 }])).toEqual([
      { id: 1 },
      { id: 2, percentage: 50 },
    ])
  })
})

describe('strainCompositionMatches', () => {
  const requested = [
    { strainId: 2, percentage: 60 },
    { strainId: 1, percentage: 40 },
  ]

  it('matches when ids and percentages align regardless of order', () => {
    const stored = [
      { id: 1, percentage: 40 },
      { id: 2, percentage: 60 },
    ]
    expect(strainCompositionMatches(requested, stored)).toBe(true)
  })

  it('rejects mismatched percentages', () => {
    const stored = [
      { id: 1, percentage: 50 },
      { id: 2, percentage: 50 },
    ]
    expect(strainCompositionMatches(requested, stored)).toBe(false)
  })

  it('requires both sides empty when no strains requested', () => {
    expect(strainCompositionMatches([], [])).toBe(true)
    expect(strainCompositionMatches([], [{ id: 1, percentage: 100 }])).toBe(false)
  })
})

describe('targetDensityMatches', () => {
  const stored = { targetDensity: 1000, targetDensityUnitId: 3 }

  it('requires exact density in required mode', () => {
    expect(targetDensityMatches(stored, { targetDensity: 1000, targetDensityUnitId: 3 }, 'required')).toBe(true)
    expect(targetDensityMatches(stored, { targetDensity: 500 }, 'required')).toBe(false)
  })

  it('allows omitted density in optional mode', () => {
    expect(targetDensityMatches(stored, {}, 'optional')).toBe(false)
    expect(targetDensityMatches({ targetDensity: null }, {}, 'optional')).toBe(true)
  })
})

describe('definitionCompositionMatches', () => {
  it('matches full stored properties object', () => {
    const props = {
      targetDensity: 1000,
      targetDensityUnitId: 2,
      strains: [{ id: 1, percentage: 100 }],
    }
    expect(
      definitionCompositionMatches(props, {
        strains: [{ strainId: 1, percentage: 100 }],
        targetDensity: 1000,
        targetDensityUnitId: 2,
      }),
    ).toBe(true)
  })
})
