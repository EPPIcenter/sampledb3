import { describe, it, expect } from 'vitest'
import {
  parseBulkImportCSV,
  validateBulkImportCSV,
  getBulkImportRequiredFields,
  getBulkImportOptionalFields,
  getBulkImportCollectionType,
  getBulkImportRowCollectionName,
} from '../bulk-import-validation'

describe('bulk-import-validation', () => {
  describe('getBulkImportCollectionType', () => {
    it('returns micronix_plate for micronix_tube and static_well', () => {
      expect(getBulkImportCollectionType('micronix_tube')).toBe('micronix_plate')
      expect(getBulkImportCollectionType('static_well')).toBe('micronix_plate')
    })
    it('returns cryovial_box for cryovial_tube', () => {
      expect(getBulkImportCollectionType('cryovial_tube')).toBe('cryovial_box')
    })
    it('returns box for paper', () => {
      expect(getBulkImportCollectionType('paper')).toBe('box')
    })
    it('returns null for none or empty', () => {
      expect(getBulkImportCollectionType('none')).toBeNull()
      expect(getBulkImportCollectionType('')).toBeNull()
    })
  })

  describe('getBulkImportRequiredFields', () => {
    it('returns study_short_code and subject_name for subjects without fixed study', () => {
      expect(
        getBulkImportRequiredFields({ importType: 'subjects', containerType: 'none' })
      ).toEqual(['study_short_code', 'subject_name'])
    })
    it('returns subject_name only for subjects with fixed study', () => {
      expect(
        getBulkImportRequiredFields({
          importType: 'subjects',
          containerType: 'none',
          fixedStudyShortCode: 'ST1',
        })
      ).toEqual(['subject_name'])
    })
    it('includes container fields for specimens with micronix_tube', () => {
      const fields = getBulkImportRequiredFields({
        importType: 'specimens',
        containerType: 'micronix_tube',
      })
      expect(fields).toContain('plate_name')
      expect(fields).toContain('barcode')
      expect(fields).toContain('position')
    })
  })

  describe('getBulkImportOptionalFields', () => {
    it('returns empty for none', () => {
      expect(getBulkImportOptionalFields('none')).toEqual([])
    })
    it('returns comment for micronix_tube', () => {
      expect(getBulkImportOptionalFields('micronix_tube')).toEqual(['comment'])
    })
  })

  describe('parseBulkImportCSV', () => {
    it('returns empty array for empty or single-line text', () => {
      expect(parseBulkImportCSV('')).toEqual([])
      expect(parseBulkImportCSV('a,b,c')).toEqual([])
    })
    it('parses headers and rows and normalizes well_position to position', () => {
      const csv = 'study_short_code,subject_name,well_position\nST1,Subj1,A01'
      const rows = parseBulkImportCSV(csv)
      expect(rows).toHaveLength(1)
      expect(rows[0].position).toBe('A01')
      expect(rows[0].study_short_code).toBe('ST1')
    })
  })

  describe('validateBulkImportCSV', () => {
    it('returns invalid when CSV is empty', () => {
      const result = validateBulkImportCSV([], {
        importType: 'specimens',
        containerType: 'none',
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].error).toContain('empty')
    })
    it('returns invalid when required columns are missing', () => {
      const rows = [{ wrong: 'col' }] as unknown as { [key: string]: string }[]
      const result = validateBulkImportCSV(rows, {
        importType: 'specimens',
        containerType: 'none',
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].error).toContain('Missing required columns')
    })
    it('returns valid and data for subjects with required fields', () => {
      const rows = [
        { study_short_code: 'ST1', subject_name: 'Subj1' },
      ] as unknown as { [key: string]: string }[]
      const result = validateBulkImportCSV(rows, {
        importType: 'subjects',
        containerType: 'none',
      })
      expect(result.valid).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toEqual({ studyShortCode: 'ST1', name: 'Subj1' })
    })
    it('returns invalid when micronix_tube row missing barcode', () => {
      const rows = [
        {
          study_short_code: 'ST1',
          subject_name: 'Subj1',
          specimen_type_name: 'DNA',
          collection_date: '2024-01-01',
          plate_name: 'P1',
          barcode: '',
          position: 'A01',
        },
      ] as unknown as { [key: string]: string }[]
      const result = validateBulkImportCSV(rows, {
        importType: 'specimens',
        containerType: 'micronix_tube',
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.error.includes('Barcode'))).toBe(true)
    })
  })

  describe('getBulkImportRowCollectionName', () => {
    it('returns plate_name value for micronix when present', () => {
      const row = { plate_name: 'Plate1', collection_name: '' }
      expect(getBulkImportRowCollectionName(row, 'micronix_tube')).toBe('Plate1')
    })
    it('falls back to collection_name when plate_name empty', () => {
      const row = { plate_name: '', collection_name: 'Col1' }
      expect(getBulkImportRowCollectionName(row, 'micronix_tube')).toBe('Col1')
    })
  })
})
