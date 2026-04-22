import { describe, it, expect } from 'vitest'
import {
  MICRONIX_WELL_POSITIONS_96,
  normalizeWellPosition,
  validateFullPlatePositions,
} from '../micronix-plate-positions'

describe('micronix-plate-positions', () => {
  describe('MICRONIX_WELL_POSITIONS_96', () => {
    it('has exactly 96 positions', () => {
      expect(MICRONIX_WELL_POSITIONS_96.size).toBe(96)
    })

    it('includes A01 and H12', () => {
      expect(MICRONIX_WELL_POSITIONS_96.has('A01')).toBe(true)
      expect(MICRONIX_WELL_POSITIONS_96.has('H12')).toBe(true)
    })

    it('has all A-H rows and 01-12 columns', () => {
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
      for (const row of rows) {
        for (let col = 1; col <= 12; col++) {
          const pos = `${row}${col.toString().padStart(2, '0')}`
          expect(MICRONIX_WELL_POSITIONS_96.has(pos)).toBe(true)
        }
      }
    })
  })

  describe('normalizeWellPosition', () => {
    it('returns null for empty or whitespace', () => {
      expect(normalizeWellPosition('')).toBe(null)
      expect(normalizeWellPosition('   ')).toBe(null)
    })

    it('normalizes A1 to A01', () => {
      expect(normalizeWellPosition('A1')).toBe('A01')
    })

    it('normalizes lowercase row', () => {
      expect(normalizeWellPosition('a1')).toBe('A01')
    })

    it('keeps two-digit column', () => {
      expect(normalizeWellPosition('A12')).toBe('A12')
    })

    it('normalizes H1 to H01', () => {
      expect(normalizeWellPosition('H1')).toBe('H01')
    })

    it('trims spaces', () => {
      expect(normalizeWellPosition('  B3  ')).toBe('B03')
    })

    it('returns null for invalid row', () => {
      expect(normalizeWellPosition('I1')).toBe(null)
      expect(normalizeWellPosition('Z01')).toBe(null)
    })

    it('returns null for invalid column', () => {
      expect(normalizeWellPosition('A0')).toBe(null)
      expect(normalizeWellPosition('A00')).toBe(null)
      expect(normalizeWellPosition('A13')).toBe(null)
      expect(normalizeWellPosition('A99')).toBe(null)
    })

    it('returns null for position without column digit', () => {
      expect(normalizeWellPosition('A')).toBe(null)
    })
  })

  describe('validateFullPlatePositions', () => {
    it('returns valid when set equals 96 positions', () => {
      const result = validateFullPlatePositions(MICRONIX_WELL_POSITIONS_96)
      expect(result.valid).toBe(true)
      expect(result.missing).toBeUndefined()
      expect(result.extra).toBeUndefined()
    })

    it('returns missing when set is smaller', () => {
      const partial = new Set(['A01', 'A02'])
      const result = validateFullPlatePositions(partial)
      expect(result.valid).toBe(false)
      expect(result.missing).toBeDefined()
      expect(result.missing!.length).toBe(94)
      expect(result.missing).toContain('A03')
      expect(result.missing).toContain('H12')
      expect(result.extra).toBeUndefined()
    })

    it('returns extra when set has invalid positions', () => {
      const withExtra = new Set([...MICRONIX_WELL_POSITIONS_96, 'I01', 'A99'])
      const result = validateFullPlatePositions(withExtra)
      expect(result.valid).toBe(false)
      expect(result.extra).toEqual(['A99', 'I01']) // sorted
      expect(result.missing).toBeUndefined()
    })

    it('returns both missing and extra when set is wrong', () => {
      const wrong = new Set(['A01', 'A02', 'I01'])
      const result = validateFullPlatePositions(wrong)
      expect(result.valid).toBe(false)
      expect(result.missing).toBeDefined()
      expect(result.missing!.length).toBe(94)
      expect(result.extra).toEqual(['I01'])
    })
  })
})
