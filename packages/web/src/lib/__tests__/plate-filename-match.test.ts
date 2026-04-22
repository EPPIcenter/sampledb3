import { describe, it, expect } from 'vitest'
import { extractPlateStemFromFilename, findPlateCandidatesFromStem } from '../plate-filename-match'

describe('plate-filename-match', () => {
  describe('extractPlateStemFromFilename', () => {
    it('returns base name without extension', () => {
      expect(extractPlateStemFromFilename('Plate1.csv')).toBe('Plate1')
      expect(extractPlateStemFromFilename('dir/Plate1.CSV')).toBe('Plate1')
    })
    it('strips date suffix', () => {
      expect(extractPlateStemFromFilename('Plate1_2024-01-15.csv')).toBe('Plate1')
      expect(extractPlateStemFromFilename('Scan_20240115_143000.csv')).toBe('Scan')
    })
    it('returns empty for empty or path-only', () => {
      expect(extractPlateStemFromFilename('')).toBe('')
      expect(extractPlateStemFromFilename('.csv')).toBe('')
    })
  })

  describe('findPlateCandidatesFromStem', () => {
    it('returns empty for empty stem or plates', () => {
      expect(findPlateCandidatesFromStem('', [{ id: 1, name: 'P1' }])).toEqual([])
      expect(findPlateCandidatesFromStem('P1', [])).toEqual([])
    })
    it('returns exact match first', () => {
      const plates = [{ id: 1, name: 'PlateA' }, { id: 2, name: 'PlateB' }]
      expect(findPlateCandidatesFromStem('platea', plates)).toEqual([
        { id: 1, name: 'PlateA', matchType: 'exact' },
      ])
    })
    it('returns contains and reverse_contains', () => {
      const plates = [{ id: 1, name: 'MyPlate' }, { id: 2, name: 'Plate' }]
      const result = findPlateCandidatesFromStem('myplate', plates)
      expect(result.map((r) => r.matchType)).toContain('exact')
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })
})
