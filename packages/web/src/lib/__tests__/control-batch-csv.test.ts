import { describe, it, expect } from 'vitest'
import { normalizePosition, parseCSV, parseContainerCSV } from '../control-batch-csv'

describe('control-batch-csv', () => {
  describe('normalizePosition', () => {
    it('normalizes row+col to two-digit column', () => {
      expect(normalizePosition('A1')).toBe('A01')
      expect(normalizePosition('B2')).toBe('B02')
      expect(normalizePosition('H12')).toBe('H12')
    })

    it('uppercases row letter', () => {
      expect(normalizePosition('a1')).toBe('A01')
    })

    it('returns trimmed input when pattern does not match', () => {
      expect(normalizePosition('  x  ')).toBe('x')
    })

    it('returns empty or whitespace as-is', () => {
      expect(normalizePosition('')).toBe('')
      expect(normalizePosition('   ')).toBe('   ')
    })
  })

  describe('parseCSV', () => {
    it('parses simple lines', () => {
      const rows = parseCSV('a,b,c\n1,2,3')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toEqual(['a', 'b', 'c'])
      expect(rows[1]).toEqual(['1', '2', '3'])
    })

    it('parses row with multiple columns', () => {
      const rows = parseCSV('a,b\n1,2')
      expect(rows.length).toBe(2)
      expect(rows[0]).toEqual(['a', 'b'])
      expect(rows[1]).toEqual(['1', '2'])
    })

    it('handles empty file', () => {
      const rows = parseCSV('')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toEqual([''])
    })
  })

  describe('parseContainerCSV', () => {
    it('returns error when CSV is empty or has no valid header', () => {
      const result = parseContainerCSV('', 'test.csv')
      expect(result.rows).toHaveLength(0)
      expect(result.errors.length).toBeGreaterThanOrEqual(1)
      expect(result.errors[0].error).toMatch(/empty|Missing required/)
    })

    it('parses valid header and rows', () => {
      const csv = 'specimen_type_name,position,barcode\nWhole Blood,A01,BAR001'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.filename).toBe('test.csv')
      expect(result.rows.length).toBeGreaterThanOrEqual(1)
      expect(result.rows[0]).toMatchObject({
        specimen_type_name: 'Whole Blood',
        position: 'A01',
        barcode: 'BAR001',
      })
    })
  })
})
