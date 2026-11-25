import { describe, it, expect } from 'vitest'
import {
  parseBulkImportCSV,
  getBulkImportRequiredFields,
  getBulkImportOptionalFields,
  getBulkImportCollectionType,
  getBulkImportRowCollectionRef,
  parseSubjectsBulkImportCsv,
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
    it('lists box_name and bag_name for paper as alternatives, not both required', () => {
      expect(
        getBulkImportRequiredFields({ importType: 'combined', containerType: 'paper', fixedStudyShortCode: 'ST' })
      ).toEqual(['subject_name', 'specimen_type_name', 'box_name or bag_name', 'sheet_name'])
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
    it('keeps quoted commas inside a cell and handles CRLF', () => {
      const csv = 'subject_name,comment,position\r\nS1,"low vol, hemolyzed",A01\r\n'
      const rows = parseBulkImportCSV(csv)
      expect(rows).toEqual([{ subject_name: 'S1', comment: 'low vol, hemolyzed', position: 'A01' }])
    })
  })

  describe('getBulkImportRowCollectionRef', () => {
    it('returns bag type for paper bag rows', () => {
      expect(getBulkImportRowCollectionRef({ bag_name: 'Bag-A' }, 'paper')).toEqual({
        name: 'Bag-A',
        type: 'bag',
      })
    })

    it('reads a barcode-shaped plate_name as a name', () => {
      expect(getBulkImportRowCollectionRef({ plate_name: 'PLATE-001' }, 'micronix_tube')).toEqual({
        name: 'PLATE-001',
        type: 'micronix_plate',
      })
    })

    it('reads a name-shaped collection_barcode as a barcode', () => {
      expect(getBulkImportRowCollectionRef({ collection_barcode: 'my box' }, 'cryovial_tube')).toEqual({
        barcode: 'my box',
        type: 'cryovial_box',
      })
    })

    it('keeps the name and barcode of one row together', () => {
      expect(
        getBulkImportRowCollectionRef({ plate_name: 'Plate A', collection_barcode: 'PB-1' }, 'static_well')
      ).toEqual({ name: 'Plate A', barcode: 'PB-1', type: 'micronix_plate' })
    })

    it('returns undefined when the row names no Collection', () => {
      expect(getBulkImportRowCollectionRef({ plate_name: ' ' }, 'micronix_tube')).toBeUndefined()
      expect(getBulkImportRowCollectionRef({ box_name: 'B', bag_name: 'G' }, 'paper')).toBeUndefined()
      expect(getBulkImportRowCollectionRef({ plate_name: 'P' }, 'none')).toBeUndefined()
    })
  })

  describe('parseSubjectsBulkImportCsv', () => {
    it('maps subjects rows with spreadsheet row numbers', () => {
      const result = parseSubjectsBulkImportCsv('study_short_code,subject_name\nST1,Subj1\n,\nST1,Subj2')
      expect(result).toEqual({
        ok: true,
        subjects: [
          { studyShortCode: 'ST1', name: 'Subj1' },
          { studyShortCode: 'ST1', name: 'Subj2' },
        ],
        fileRows: [2, 4],
      })
    })

    it('requires study_short_code when fixedStudyShortCode is absent', () => {
      const result = parseSubjectsBulkImportCsv('study_short_code,subject_name\n,S1')
      expect(result).toEqual({
        ok: false,
        errors: [{ fileRows: [2], error: 'Missing required value: study_short_code' }],
        fileRows: [2],
      })
    })
  })
})
