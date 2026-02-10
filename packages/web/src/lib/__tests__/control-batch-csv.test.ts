import { describe, it, expect } from 'vitest'
import {
  normalizePosition,
  parseCSV,
  parseContainerCSV,
  validateCSVRows,
  generateCSVTemplate,
  groupRowsBySpecimenType,
} from '../control-batch-csv'

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

    it('handles quoted fields', () => {
      const rows = parseCSV('"a","b"\n1,2')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toEqual(['a', 'b'])
      expect(rows[1]).toEqual(['1', '2'])
    })

    it('handles CRLF line endings', () => {
      const rows = parseCSV('a,b\r\n1,2')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toEqual(['a', 'b'])
      expect(rows[1]).toEqual(['1', '2'])
    })
  })

  describe('parseContainerCSV', () => {
    it('returns error when CSV is empty or has no valid header', () => {
      const result = parseContainerCSV('', 'test.csv')
      expect(result.rows).toHaveLength(0)
      expect(result.errors.length).toBeGreaterThanOrEqual(1)
      expect(result.errors[0].error).toMatch(/empty|Missing required/)
    })

    it('returns error when required column specimen_type_name is missing', () => {
      const result = parseContainerCSV('position,barcode\nA01,BAR1', 'test.csv')
      expect(result.rows).toHaveLength(0)
      expect(result.errors.some((e) => e.error.includes('specimen_type_name'))).toBe(true)
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

    it('skips empty rows and collects validation errors for missing specimen type', () => {
      const csv = 'specimen_type_name,position\n  \n,A01\nWhole Blood,A01'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.rows.some((r) => r.specimen_type_name === 'Whole Blood')).toBe(true)
      expect(result.errors.some((e) => e.error.includes('Specimen type name'))).toBe(true)
    })

    it('validates quantity as number and adds error for NaN', () => {
      const csv = 'specimen_type_name,quantity\nWhole Blood,abc'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.errors.some((e) => e.field === 'quantity' && e.error.includes('number'))).toBe(true)
    })

    it('parses quantity and unit_symbol when present', () => {
      const csv = 'specimen_type_name,position,barcode,quantity,unit_symbol\nWhole Blood,A01,BAR,5,µL'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.rows[0].quantity).toBe(5)
      expect(result.rows[0].unit_symbol).toBe('µL')
    })
  })

  describe('validateCSVRows', () => {
    const availableTypes = [{ name: 'Whole Blood' }, { name: 'Plasma' }]

    it('returns errors for unknown specimen types', () => {
      const rows = [
        { specimen_type_name: 'Whole Blood' },
        { specimen_type_name: 'Unknown Type' },
      ]
      const errors = validateCSVRows(rows, availableTypes)
      expect(errors).toHaveLength(1)
      expect(errors[0].error).toContain('Unknown specimen type')
      expect(errors[0].field).toBe('specimen_type_name')
    })

    it('requires position for micronix_tube and cryovial_tube', () => {
      const rows = [{ specimen_type_name: 'Whole Blood' }]
      expect(validateCSVRows(rows, availableTypes, 'micronix_tube')).toHaveLength(1)
      expect(validateCSVRows(rows, availableTypes, 'cryovial_tube')).toHaveLength(1)
      expect(validateCSVRows(rows, availableTypes, 'paper')).toHaveLength(0)
    })

    it('validates quantity is non-negative number', () => {
      const rows = [
        { specimen_type_name: 'Whole Blood', quantity: -1 },
        { specimen_type_name: 'Plasma', quantity: NaN },
      ]
      const errors = validateCSVRows(rows, availableTypes)
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some((e) => e.field === 'quantity')).toBe(true)
    })

    it('returns no errors when all valid', () => {
      const rows = [
        { specimen_type_name: 'Whole Blood', position: 'A01' },
        { specimen_type_name: 'Plasma', position: 'A02' },
      ]
      expect(validateCSVRows(rows, availableTypes, 'micronix_tube')).toHaveLength(0)
    })
  })

  describe('generateCSVTemplate', () => {
    const types = [
      { id: 1, name: 'Whole Blood' },
      { id: 2, name: 'Plasma' },
    ]

    it('generates paper template with specimen_type_name,barcode,quantity,unit_symbol', () => {
      const out = generateCSVTemplate('paper', types)
      expect(out).toContain('specimen_type_name,barcode,quantity,unit_symbol')
      expect(out).toContain('Whole Blood')
      expect(out).toContain('spots')
    })

    it('generates cryovial_tube template with position and barcode', () => {
      const out = generateCSVTemplate('cryovial_tube', types)
      expect(out).toContain('specimen_type_name,position,barcode,quantity,unit_symbol')
      expect(out).toContain('B1')
      expect(out).toContain('CV-')
    })

    it('generates micronix_tube template with position and barcode', () => {
      const out = generateCSVTemplate('micronix_tube', types)
      expect(out).toContain('specimen_type_name,position,barcode,quantity,unit_symbol')
      expect(out).toContain('A1')
      expect(out).toContain('MT-')
    })

    it('handles single specimen type', () => {
      const out = generateCSVTemplate('paper', [{ id: 1, name: 'Only' }])
      expect(out).toContain('Only')
    })
  })

  describe('groupRowsBySpecimenType', () => {
    it('groups rows by specimen_type_name', () => {
      const rows = [
        { specimen_type_name: 'A' },
        { specimen_type_name: 'B' },
        { specimen_type_name: 'A' },
      ]
      const grouped = groupRowsBySpecimenType(rows)
      expect(grouped.get('A')).toHaveLength(2)
      expect(grouped.get('B')).toHaveLength(1)
    })

    it('returns empty map for empty rows', () => {
      const grouped = groupRowsBySpecimenType([])
      expect(grouped.size).toBe(0)
    })
  })
})
