import { describe, expect, it } from 'bun:test'
import {
  parseBarcodeExportFilterCsv,
  parseMultiStudyExportFilterCsv,
  parseSingleStudyExportFilterCsv,
} from '../export-filter-parse'

describe('parseMultiStudyExportFilterCsv', () => {
  it('parses required columns from simple CSV', () => {
    const rows = parseMultiStudyExportFilterCsv('study_short_code,subject_name\nST1,Alice\nST2,Bob')
    expect(rows).toEqual([
      { study_short_code: 'ST1', subject_name: 'Alice' },
      { study_short_code: 'ST2', subject_name: 'Bob' },
    ])
  })

  it('accepts header aliases case-insensitively', () => {
    const rows = parseMultiStudyExportFilterCsv('Study Short Code,Subject Name\nST1,Alice')
    expect(rows[0]).toEqual({ study_short_code: 'ST1', subject_name: 'Alice' })
  })

  it('handles quoted commas and CRLF line endings', () => {
    const csv = 'study_short_code,subject_name,comment\r\nST1,"Smith, Jane"\r\n'
    expect(parseMultiStudyExportFilterCsv(csv)).toEqual([
      { study_short_code: 'ST1', subject_name: 'Smith, Jane' },
    ])
  })

  it('throws when study_short_code column is missing', () => {
    expect(() => parseMultiStudyExportFilterCsv('subject_name\nAlice')).toThrow(
      /study_short_code/
    )
  })
})

describe('parseSingleStudyExportFilterCsv', () => {
  it('parses subject_name and optional date columns', () => {
    const rows = parseSingleStudyExportFilterCsv(
      'subject_name,collection_date\nAlice,2024-01-15'
    )
    expect(rows).toEqual([{ subject_name: 'Alice', collection_date: '2024-01-15' }])
  })

  it('throws when subject_name column is missing', () => {
    expect(() => parseSingleStudyExportFilterCsv('study_short_code\nST1')).toThrow(/subject_name/)
  })
})

describe('parseBarcodeExportFilterCsv', () => {
  it('parses barcode column values', () => {
    expect(parseBarcodeExportFilterCsv('barcode\nMTX-001\nMTX-002')).toEqual(['MTX-001', 'MTX-002'])
  })

  it('handles escaped quotes and CRLF', () => {
    const csv = 'barcode\r\n"MTX-""001"""\r\n'
    expect(parseBarcodeExportFilterCsv(csv)).toEqual(['MTX-"001"'])
  })

  it('throws when barcode column is missing', () => {
    expect(() => parseBarcodeExportFilterCsv('position\nA01')).toThrow(/barcode/)
  })
})
