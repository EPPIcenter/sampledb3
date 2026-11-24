import { describe, it, expect } from 'vitest'
import {
  parseBulkImportCSV,
  mapBulkImportRowsToPayload,
  getBulkImportRequiredFields,
  getBulkImportOptionalFields,
  getBulkImportCollectionType,
  getBulkImportRowCollectionName,
  resolveBulkImportPaperParent,
  getBulkImportRowCollectionRef,
  parseBulkImportCsvFileRows,
  validateBulkImportRequiredCells,
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

  describe('validateBulkImportRequiredCells', () => {
    it('reports an empty micronix barcode with its spreadsheet row after a blank row', () => {
      const csv =
        'subject_name,specimen_type_name,plate_name,barcode,position\n' +
        'S1,Serum,P1,MT1,A01\n' +
        ',,,,\n' +
        'S2,Serum,P1,,A02\n'
      const { rows, fileRows } = parseBulkImportCsvFileRows(csv)
      expect(
        validateBulkImportRequiredCells(rows, fileRows, {
          importType: 'specimens',
          containerType: 'micronix_tube',
          fixedStudyShortCode: 'ST',
        })
      ).toEqual([{ fileRows: [4], error: 'Missing required value: barcode' }])
    })

    it('accepts collection_barcode without plate_name for micronix tubes and requires at least one', () => {
      const withBarcode = parseBulkImportCsvFileRows(
        'subject_name,specimen_type_name,collection_barcode,barcode,position\nS1,Serum,PB1,MT1,A01'
      )
      expect(
        validateBulkImportRequiredCells(withBarcode.rows, withBarcode.fileRows, {
          importType: 'combined',
          containerType: 'micronix_tube',
          fixedStudyShortCode: 'ST',
        })
      ).toEqual([])

      const withoutEither = parseBulkImportCsvFileRows(
        'subject_name,specimen_type_name,plate_name,barcode,position\nS1,Serum,,MT1,A01'
      )
      expect(
        validateBulkImportRequiredCells(withoutEither.rows, withoutEither.fileRows, {
          importType: 'specimens',
          containerType: 'micronix_tube',
          fixedStudyShortCode: 'ST',
        })
      ).toEqual([{ fileRows: [2], error: 'Missing required value: plate_name (or collection_barcode)' }])
    })

    it('validates paper parent (box_name or bag_name, not both) and sheet_name', () => {
      const csv =
        'study_short_code,subject_name,specimen_type_name,box_name,bag_name,sheet_name\n' +
        'ST,S1,DBS,B1,G1,Sheet1\n' +
        'ST,S2,DBS,,,\n'
      const { rows, fileRows } = parseBulkImportCsvFileRows(csv)
      expect(
        validateBulkImportRequiredCells(rows, fileRows, {
          importType: 'specimens',
          containerType: 'paper',
        })
      ).toEqual([
        { fileRows: [2], error: 'Provide either box_name or bag_name, not both' },
        { fileRows: [3], error: 'Missing required value: box_name or bag_name' },
        { fileRows: [3], error: 'Missing required value: sheet_name' },
      ])
    })

    it('requires study_short_code when fixedStudyShortCode is absent', () => {
      const { rows, fileRows } = parseBulkImportCsvFileRows('study_short_code,subject_name\n,S1')
      expect(
        validateBulkImportRequiredCells(rows, fileRows, {
          importType: 'subjects',
          containerType: 'none',
        })
      ).toEqual([{ fileRows: [2], error: 'Missing required value: study_short_code' }])
    })
  })
})
