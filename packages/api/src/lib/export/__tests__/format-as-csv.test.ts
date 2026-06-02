import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsv } from '@sampledb/contract'
import type { ContainerExportData } from '@sampledb/contract'
import type { Database } from '../../../db/client'
import { formatAsCSV, formatAsExcel } from '../format'

const lfNoBom = { delimiter: ',', bom: false, lineEnding: 'lf' as const }
const unusedDb = {} as Database

const sampleContainer: ContainerExportData = {
  container_id: 1,
  container_type: 'micronix_tube',
  barcode: '00123',
  position: 'A01',
  tags: 'Hold',
  status: 'In Use',
  specimen_id: 10,
  specimen_type: 'Blood',
  collection_date: '2024-01-15T10:30:00Z',
  target_density: 1.5,
  created: '2024-01-01T00:00:00.000Z',
  last_updated: '2024-01-02T00:00:00.000Z',
}

describe('formatAsCSV', () => {
  it('uses shared cell formatting without Excel formula wrappers', async () => {
    const csv = await formatAsCSV(
      unusedDb,
      [sampleContainer],
      ['barcode', 'target_density', 'collection_date'],
      lfNoBom
    )

    expect(csv).not.toContain('=""')
    expect(parseCsv(csv)).toEqual([
      ['barcode', 'target_density', 'collection_date'],
      ['00123', '1.5', '2024-01-15'],
    ])
  })

  it('respects explicit column selection', async () => {
    const csv = await formatAsCSV(unusedDb, [sampleContainer], ['barcode', 'position'], lfNoBom)
    expect(parseCsv(csv)[0]).toEqual(['barcode', 'position'])
  })
})

describe('formatAsExcel', () => {
  it('marks identifier columns as text cells to preserve leading zeros', async () => {
    const buffer = await formatAsExcel(unusedDb, [sampleContainer], ['barcode', 'target_density'])
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    const barcodeCell = sheet.A2
    const densityCell = sheet.B2

    expect(barcodeCell.t).toBe('s')
    expect(barcodeCell.v).toBe('00123')
    expect(densityCell.t).toBe('n')
    expect(densityCell.v).toBe(1.5)
  })

  it('preserves leading-zero barcode values when workbook is read back', async () => {
    const buffer = await formatAsExcel(unusedDb, [sampleContainer], ['barcode'])
    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: false, cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    expect(sheet.A2.v).toBe('00123')
    expect(sheet.A2.v).not.toBe(123)
  })
})
