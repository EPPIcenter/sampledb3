import { describe, it, expect } from 'vitest'
import {
  parseBulkImportCSV,
  mapBulkImportRowsToPayload,
  getBulkImportRequiredFields,
  getBulkImportOptionalFields,
  getBulkImportCollectionType,
  getBulkImportRowCollectionName,
  resolveBulkImportPaperParent,
  getBulkImportRowCollectionCheck,
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

  describe('mapBulkImportRowsToPayload', () => {
    it('maps subjects rows to API payload', () => {
      const rows = [
        { study_short_code: 'ST1', subject_name: 'Subj1' },
      ] as unknown as { [key: string]: string }[]
      const data = mapBulkImportRowsToPayload(rows, {
        importType: 'subjects',
        containerType: 'none',
      })
      expect(data).toHaveLength(1)
      expect(data[0]).toEqual({ studyShortCode: 'ST1', name: 'Subj1' })
    })

    it('maps specimen rows including optional container fields', () => {
      const rows = [
        {
          study_short_code: 'ST1',
          subject_name: 'Subj1',
          specimen_type_name: 'WB',
          box_name: 'B1',
          position: 'A01',
        },
      ] as { [key: string]: string }[]
      const data = mapBulkImportRowsToPayload(rows, {
        importType: 'specimens',
        containerType: 'cryovial_tube',
      })
      expect(data).toHaveLength(1)
      const container = (data[0] as { container?: Record<string, unknown> }).container
      expect(container?.collectionName).toBe('B1')
      expect(container?.barcode).toBeUndefined()
      expect(container?.comment).toBeUndefined()
    })

    it('maps micronix rows even when barcode is empty (server validates)', () => {
      const rows = [
        {
          study_short_code: 'ST1',
          subject_name: 'Subj1',
          specimen_type_name: 'DNA',
          plate_name: 'P1',
          barcode: '',
          position: 'A01',
        },
      ] as { [key: string]: string }[]
      const data = mapBulkImportRowsToPayload(rows, {
        importType: 'specimens',
        containerType: 'micronix_tube',
      })
      expect(data).toHaveLength(1)
      const container = (data[0] as { container?: Record<string, unknown> }).container
      expect(container?.barcode).toBeUndefined()
      expect(container?.position).toBe('A01')
    })
  })

  describe('getBulkImportRowCollectionName', () => {
    it('returns plate_name for micronix_tube from type-specific column', () => {
      expect(getBulkImportRowCollectionName({ plate_name: 'Plate1' }, 'micronix_tube')).toBe('Plate1')
    })
    it('returns box_name for cryovial_tube', () => {
      expect(
        getBulkImportRowCollectionName({ box_name: 'BOX-1' }, 'cryovial_tube')
      ).toBe('BOX-1')
    })
    it('returns undefined when type-specific column is empty', () => {
      expect(getBulkImportRowCollectionName({ plate_name: '' }, 'micronix_tube')).toBeUndefined()
    })
    it('does not use collection_name; legacy column is ignored', () => {
      expect(
        getBulkImportRowCollectionName(
          { collection_name: 'LegacyOnly' } as { [k: string]: string },
          'micronix_tube'
        )
      ).toBeUndefined()
    })
    it('returns box_name for paper when box_name is populated', () => {
      expect(
        getBulkImportRowCollectionName({ box_name: 'Box-A', bag_name: '' }, 'paper')
      ).toBe('Box-A')
    })
    it('returns bag_name for paper when bag_name is populated', () => {
      expect(
        getBulkImportRowCollectionName({ box_name: '', bag_name: 'Bag-A' }, 'paper')
      ).toBe('Bag-A')
    })
  })

  describe('resolveBulkImportPaperParent', () => {
    it('rejects both box_name and bag_name', () => {
      const result = resolveBulkImportPaperParent({ box_name: 'B1', bag_name: 'G1' })
      expect(result).toEqual({ error: 'Provide either box_name or bag_name, not both' })
    })
  })

  describe('getBulkImportRowCollectionCheck', () => {
    it('returns bag type for paper bag rows', () => {
      expect(getBulkImportRowCollectionCheck({ bag_name: 'Bag-A' }, 'paper')).toEqual({
        identifier: 'Bag-A',
        type: 'bag',
      })
    })
  })
})
