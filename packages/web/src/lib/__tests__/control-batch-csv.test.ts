import { describe, it, expect } from 'vitest'
import {
  normalizePosition,
  parseContainerCSV,
  validateCSVRows,
  generateCSVTemplate,
  groupRowsBySpecimenType,
  groupRowsByDensity,
  inferSheetName,
  inferContainerTypeFromHeader,
  inferContainerCategoryFromHeader,
  uniqueSheetNamesFromRows,
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

    it('parses sheet_name column for paper CSV', () => {
      const csv = 'specimen_type_name,barcode,quantity,unit_symbol,density,sheet_name\nWhole Blood,,5,spots,100,Sheet1\nPlasma,,5,spots,200,Sheet2'
      const result = parseContainerCSV(csv, 'paper.csv')
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toMatchObject({ specimen_type_name: 'Whole Blood', sheet_name: 'Sheet1' })
      expect(result.rows[1]).toMatchObject({ specimen_type_name: 'Plasma', sheet_name: 'Sheet2' })
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

    it('parses optional density column as number', () => {
      const csv = 'specimen_type_name,position,density\nWhole Blood,A01,100\nPlasma,A02,200'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].density).toBe(100)
      expect(result.rows[1].density).toBe(200)
    })

    it('leaves density undefined when column missing', () => {
      const csv = 'specimen_type_name,position\nWhole Blood,A01'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.rows[0].density).toBeUndefined()
    })

    it('parses empty density as undefined', () => {
      const csv = 'specimen_type_name,position,density\nWhole Blood,A01,\nPlasma,A02,50'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.rows[0].density).toBeUndefined()
      expect(result.rows[1].density).toBe(50)
    })

    it('adds error when density is non-numeric', () => {
      const csv = 'specimen_type_name,position,density\nWhole Blood,A01,abc'
      const result = parseContainerCSV(csv, 'test.csv')
      expect(result.errors.some((e) => e.field === 'density' && e.error.toLowerCase().includes('number'))).toBe(true)
    })
  })

  describe('groupRowsByDensity', () => {
    it('groups rows by density when present', () => {
      const rows = [
        { specimen_type_name: 'A', density: 100 },
        { specimen_type_name: 'B', density: 200 },
        { specimen_type_name: 'C', density: 100 },
      ]
      const grouped = groupRowsByDensity(rows)
      expect(grouped.get(100)).toHaveLength(2)
      expect(grouped.get(200)).toHaveLength(1)
    })

    it('puts rows without density under undefined key', () => {
      const rows = [
        { specimen_type_name: 'A' },
        { specimen_type_name: 'B', density: 50 },
      ]
      const grouped = groupRowsByDensity(rows)
      expect(grouped.get(undefined)).toHaveLength(1)
      expect(grouped.get(50)).toHaveLength(1)
    })

    it('returns empty map for empty rows', () => {
      const grouped = groupRowsByDensity([])
      expect(grouped.size).toBe(0)
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

    it('generates paper template without unit column (default unit used)', () => {
      const out = generateCSVTemplate('paper', types)
      expect(out).toContain('specimen_type_name,barcode,quantity,density,sheet_name')
      expect(out).not.toContain('unit_symbol')
      expect(out).toContain('Whole Blood')
      expect(out).toContain('Sheet1')
      expect(out).toContain('Sheet2')
    })

    it('generates cryovial_tube template with A01-style positions and barcode, no unit column', () => {
      const out = generateCSVTemplate('cryovial_tube', types)
      expect(out).toContain('specimen_type_name,position,barcode,quantity,density')
      expect(out).not.toContain('unit_symbol')
      expect(out).toContain('B01')
      expect(out).toContain('B02')
      expect(out).toContain('CV-')
    })

    it('generates micronix_tube template with A01-style positions and barcode, no unit column', () => {
      const out = generateCSVTemplate('micronix_tube', types)
      expect(out).toContain('specimen_type_name,position,barcode,quantity,density')
      expect(out).not.toContain('unit_symbol')
      expect(out).toContain('A01')
      expect(out).toContain('A02')
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

  describe('inferSheetName', () => {
    it('returns the sheet name when all rows have the same non-empty sheet_name', () => {
      const rows = [
        { specimen_type_name: 'A', sheet_name: 'Sheet1' },
        { specimen_type_name: 'B', sheet_name: 'Sheet1' },
      ]
      expect(inferSheetName(rows)).toBe('Sheet1')
    })

    it('returns undefined when rows have no sheet_name', () => {
      const rows = [
        { specimen_type_name: 'A' },
        { specimen_type_name: 'B' },
      ] as unknown as { sheet_name?: string }[]
      expect(inferSheetName(rows)).toBeUndefined()
    })

    it('returns undefined when rows have mixed sheet_name values', () => {
      const rows = [
        { specimen_type_name: 'A', sheet_name: 'Sheet1' },
        { specimen_type_name: 'B', sheet_name: 'Sheet2' },
      ]
      expect(inferSheetName(rows)).toBeUndefined()
    })

    it('returns undefined when all sheet_name values are empty or whitespace', () => {
      const rows = [
        { specimen_type_name: 'A', sheet_name: '' },
        { specimen_type_name: 'B', sheet_name: '   ' },
      ]
      expect(inferSheetName(rows)).toBeUndefined()
    })

    it('trims whitespace and returns single value when all match after trim', () => {
      const rows = [
        { specimen_type_name: 'A', sheet_name: '  Sheet1  ' },
        { specimen_type_name: 'B', sheet_name: 'Sheet1' },
      ]
      expect(inferSheetName(rows)).toBe('Sheet1')
    })

    it('returns undefined for empty rows array', () => {
      expect(inferSheetName([])).toBeUndefined()
    })
  })

  describe('uniqueSheetNamesFromRows', () => {
    it('returns unique non-empty sheet names in order of first appearance', () => {
      const rows = [
        { specimen_type_name: 'A', sheet_name: 'Sheet1' },
        { specimen_type_name: 'B', sheet_name: 'Sheet2' },
        { specimen_type_name: 'C', sheet_name: 'Sheet1' },
      ] as unknown as { sheet_name?: string }[]
      expect(uniqueSheetNamesFromRows(rows)).toEqual(['Sheet1', 'Sheet2'])
    })

    it('trims and filters empty values', () => {
      const rows = [
        { specimen_type_name: 'A', sheet_name: '  X  ' },
        { specimen_type_name: 'B', sheet_name: '' },
      ] as unknown as { sheet_name?: string }[]
      expect(uniqueSheetNamesFromRows(rows)).toEqual(['X'])
    })

    it('returns empty array when no sheet names', () => {
      expect(uniqueSheetNamesFromRows([])).toEqual([])
      expect(uniqueSheetNamesFromRows([{ specimen_type_name: 'A' }] as unknown as { sheet_name?: string }[])).toEqual([])
    })
  })

  describe('inferContainerTypeFromHeader', () => {
    it('returns paper when header includes sheet_name', () => {
      expect(inferContainerTypeFromHeader(['specimen_type_name', 'barcode', 'sheet_name'])).toBe('paper')
      expect(inferContainerTypeFromHeader(['Sheet_Name', 'specimen_type_name'])).toBe('paper')
    })

    it('returns cryovial_tube when header has position but no sheet_name', () => {
      expect(inferContainerTypeFromHeader(['specimen_type_name', 'position', 'barcode'])).toBe('cryovial_tube')
    })

    it('returns undefined when header has neither sheet_name nor position', () => {
      expect(inferContainerTypeFromHeader(['specimen_type_name', 'barcode'])).toBeUndefined()
    })

    it('tube (position) wins when both position and sheet_name present', () => {
      expect(inferContainerTypeFromHeader(['specimen_type_name', 'position', 'sheet_name'])).toBe('cryovial_tube')
    })
  })

  describe('inferContainerCategoryFromHeader', () => {
    it('returns paper when header includes sheet_name but not position', () => {
      expect(inferContainerCategoryFromHeader(['specimen_type_name', 'sheet_name'])).toBe('paper')
    })

    it('returns tube when header has position', () => {
      expect(inferContainerCategoryFromHeader(['specimen_type_name', 'position', 'barcode'])).toBe('tube')
    })

    it('returns undefined when header has neither sheet_name nor position', () => {
      expect(inferContainerCategoryFromHeader(['specimen_type_name', 'barcode'])).toBeUndefined()
    })

    it('tube (position) wins when both position and sheet_name present', () => {
      expect(inferContainerCategoryFromHeader(['specimen_type_name', 'position', 'sheet_name'])).toBe('tube')
    })
  })
})
