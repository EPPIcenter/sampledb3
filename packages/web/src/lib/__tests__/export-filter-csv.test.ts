import { describe, expect, it } from 'vitest'
import {
  parseBarcodeExportFilterFile,
  parseExportModalCsv,
  parseMultiStudyExportFilterFile,
} from '../export-filter-csv'

describe('export-filter-csv', () => {
  it('parses multi-study export filter files', async () => {
    const file = new File(['study_short_code,subject_name\nST1,Alice'], 'export.csv', {
      type: 'text/csv',
    })
    await expect(parseMultiStudyExportFilterFile(file)).resolves.toEqual([
      { study_short_code: 'ST1', subject_name: 'Alice' },
    ])
  })

  it('parses single-study export modal files', async () => {
    const file = new File(['subject_name\nAlice'], 'export.csv', { type: 'text/csv' })
    await expect(parseExportModalCsv(file)).resolves.toEqual([{ subject_name: 'Alice' }])
  })

  it('parses barcode export files with CRLF and quoted values', async () => {
    const file = new File(['barcode\r\n"MTX-001"\r\n'], 'barcodes.csv', { type: 'text/csv' })
    await expect(parseBarcodeExportFilterFile(file)).resolves.toEqual(['MTX-001'])
  })

  it('surfaces flow-specific header errors for multi-study uploads', async () => {
    const file = new File(['subject_name\nAlice'], 'bad.csv', { type: 'text/csv' })
    await expect(parseMultiStudyExportFilterFile(file)).rejects.toThrow(/study_short_code/)
  })
})
