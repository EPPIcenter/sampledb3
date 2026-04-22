import { describe, it, expect } from 'vitest'
import { getCompositionKey, type StrainWithPercentage } from '../composition-key'

describe('composition-key', () => {
  describe('getCompositionKey', () => {
    it('returns same key for same strain ids and percentages regardless of order', () => {
      const a: StrainWithPercentage[] = [
        { id: 1, percentage: 50 },
        { id: 2, percentage: 50 },
      ]
      const b: StrainWithPercentage[] = [
        { id: 2, percentage: 50 },
        { id: 1, percentage: 50 },
      ]
      expect(getCompositionKey(a)).toBe(getCompositionKey(b))
    })

    it('returns different key for different percentages', () => {
      const a: StrainWithPercentage[] = [{ id: 1, percentage: 60 }, { id: 2, percentage: 40 }]
      const b: StrainWithPercentage[] = [{ id: 1, percentage: 50 }, { id: 2, percentage: 50 }]
      expect(getCompositionKey(a)).not.toBe(getCompositionKey(b))
    })

    it('returns different key for different strain ids', () => {
      const a: StrainWithPercentage[] = [{ id: 1, percentage: 100 }]
      const b: StrainWithPercentage[] = [{ id: 2, percentage: 100 }]
      expect(getCompositionKey(a)).not.toBe(getCompositionKey(b))
    })

    it('returns stable key for single strain', () => {
      const strains: StrainWithPercentage[] = [{ id: 5, percentage: 100 }]
      expect(getCompositionKey(strains)).toBe('5:100')
    })

    it('sorts by strain id so key is deterministic', () => {
      const strains: StrainWithPercentage[] = [
        { id: 10, percentage: 30 },
        { id: 2, percentage: 70 },
      ]
      expect(getCompositionKey(strains)).toBe('2:70,10:30')
    })

    it('returns empty string for empty strains', () => {
      expect(getCompositionKey([])).toBe('')
    })

    it('ignores undefined percentage by treating as 0 for key', () => {
      const a: StrainWithPercentage[] = [{ id: 1 }, { id: 2 }]
      const b: StrainWithPercentage[] = [{ id: 1, percentage: 0 }, { id: 2, percentage: 0 }]
      expect(getCompositionKey(a)).toBe(getCompositionKey(b))
    })
  })
})
