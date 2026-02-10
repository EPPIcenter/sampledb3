import { describe, it, expect } from 'vitest'
import { normalizeWellPosition, validateWellPosition, parsePlateCSV } from '../plate-csv'
import type { ScannerConfiguration } from '../settings'

describe('plate-csv', () => {
  describe('normalizeWellPosition', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeWellPosition('')).toBe('')
    })

    it('trims and returns empty for whitespace-only', () => {
      expect(normalizeWellPosition('   ')).toBe('')
    })

    it('normalizes A1 to A01', () => {
      expect(normalizeWellPosition('A1')).toBe('A01')
    })

    it('normalizes a1 to A01 (lowercase row)', () => {
      expect(normalizeWellPosition('a1')).toBe('A01')
    })

    it('normalizes A12 to A12', () => {
      expect(normalizeWellPosition('A12')).toBe('A12')
    })

    it('normalizes H1 to H01', () => {
      expect(normalizeWellPosition('H1')).toBe('H01')
    })

    it('trims and normalizes', () => {
      expect(normalizeWellPosition('  B3  ')).toBe('B03')
    })

    it('returns input unchanged when not matching A-H + digits', () => {
      expect(normalizeWellPosition('I1')).toBe('I1')
      expect(normalizeWellPosition('A')).toBe('A')
      expect(normalizeWellPosition('1')).toBe('1')
    })
  })

  describe('validateWellPosition', () => {
    it('returns null for empty string', () => {
      expect(validateWellPosition('')).toBeNull()
    })

    it('returns null for invalid column (0)', () => {
      expect(validateWellPosition('A0')).toBeNull()
    })

    it('returns null for invalid column (13)', () => {
      expect(validateWellPosition('A13')).toBeNull()
    })

    it('returns null when column is missing (e.g. row letter only)', () => {
      expect(validateWellPosition('A')).toBeNull()
    })

    it('returns normalized position for A01', () => {
      expect(validateWellPosition('A01')).toBe('A01')
    })

    it('returns normalized position for A1', () => {
      expect(validateWellPosition('A1')).toBe('A01')
    })

    it('returns A12 for column 12', () => {
      expect(validateWellPosition('A12')).toBe('A12')
    })
  })

  describe('parsePlateCSV', () => {
    const singleColumnConfig: ScannerConfiguration = {
      id: 'single',
      name: 'Single',
      barcodeColumn: 'Barcode',
      positionType: 'single',
      positionColumn: 'Well',
      skipRows: 0,
    }

    const combinedConfig: ScannerConfiguration = {
      id: 'combined',
      name: 'Combined',
      barcodeColumn: 'Barcode',
      positionType: 'combined',
      rowColumn: 'Row',
      columnColumn: 'Col',
      skipRows: 1,
    }

    it('returns empty array when lines <= skipRows', () => {
      expect(parsePlateCSV('', singleColumnConfig)).toEqual([])
      expect(parsePlateCSV('Only header', singleColumnConfig)).toEqual([])
      const twoLines = 'Well,Barcode\nA01,MT001'
      expect(parsePlateCSV(twoLines, { ...singleColumnConfig, skipRows: 2 })).toEqual([])
    })

    it('parses single-column position type', () => {
      const csv = 'Well,Barcode\nA01,MT001\nB02,MT002'
      const result = parsePlateCSV(csv, singleColumnConfig)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ wellPosition: 'A01', barcode: 'MT001' })
      expect(result[1]).toEqual({ wellPosition: 'B02', barcode: 'MT002' })
    })

    it('parses combined row/column position type', () => {
      const csv = 'Skip this\nRow,Col,Barcode\nA,1,MT001\nA,2,'
      const result = parsePlateCSV(csv, combinedConfig)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ wellPosition: 'A01', barcode: 'MT001' })
      expect(result[1]).toEqual({ wellPosition: 'A02', barcode: '' })
    })

    it('dedupes by position with last winning', () => {
      const csv = 'Well,Barcode\nA01,First\nA01,Second'
      const result = parsePlateCSV(csv, singleColumnConfig)
      expect(result).toHaveLength(1)
      expect(result[0].barcode).toBe('Second')
    })

    it('skips rows with empty or invalid well position', () => {
      const csv = 'Well,Barcode\n,MT001\nA01,MT002'
      const result = parsePlateCSV(csv, singleColumnConfig)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ wellPosition: 'A01', barcode: 'MT002' })
    })

    it('trims header and values', () => {
      const csv = '  Well  ,  Barcode  \n  A01  ,  MT001  '
      const result = parsePlateCSV(csv, singleColumnConfig)
      expect(result[0]).toEqual({ wellPosition: 'A01', barcode: 'MT001' })
    })
  })
})
