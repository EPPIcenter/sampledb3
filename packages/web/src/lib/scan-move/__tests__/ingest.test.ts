import { describe, expect, it } from 'vitest'
import type { ScannerConfiguration } from '../../api/settings'
import { ingestScanCsvText, ingestScanFiles, parseBuiltinMoveCsv, splitCsvLine } from '../ingest'
import { CRYOVIAL_MOVE_CSV_SPEC, cryovialScanMoveVariant, micronixScanMoveVariant } from '../variants'
import { fileSource } from './helpers'

describe('splitCsvLine', () => {
  it('splits plain fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('honours quoted fields with commas and escaped quotes', () => {
    expect(splitCsvLine('"Box, shelf 2",A01,"say ""hi"""')).toEqual(['Box, shelf 2', 'A01', 'say "hi"'])
  })

  it('keeps empty fields', () => {
    expect(splitCsvLine('a,,c,')).toEqual(['a', '', 'c', ''])
  })
})

describe('parseBuiltinMoveCsv', () => {
  it('rejects an empty file', () => {
    const result = parseBuiltinMoveCsv('', CRYOVIAL_MOVE_CSV_SPEC)
    expect(result.errors).toEqual([{ row: 0, error: 'CSV file is empty' }])
  })

  it('parses rows and flags missing required columns with 1-based rows', () => {
    const text = [
      'source_collection_name,source_position,target_position',
      'BOX-1,A01,B01',
      ',A02,B02',
      'BOX-1,,B03',
    ].join('\n')
    const result = parseBuiltinMoveCsv(text, CRYOVIAL_MOVE_CSV_SPEC)
    expect(result.csvRows).toHaveLength(3)
    expect(result.csvRows[0]).toMatchObject({
      source_collection_name: 'BOX-1',
      source_position: 'A01',
      target_position: 'B01',
    })
    expect(result.errors).toEqual([
      { row: 2, error: 'source_collection_name is required but missing or empty' },
      { row: 3, error: 'source_position is required but missing or empty' },
    ])
  })

  it('parses quoted collection names containing commas (the old inline parser could not)', () => {
    const text = [
      'source_collection_name,source_position,target_position',
      '"Box, rack 2",A01,B01',
    ].join('\r\n')
    const result = parseBuiltinMoveCsv(text, CRYOVIAL_MOVE_CSV_SPEC)
    expect(result.errors).toEqual([])
    expect(result.csvRows[0].source_collection_name).toBe('Box, rack 2')
  })
})

describe('cryovial ingest', () => {
  const boxes = [
    { id: 1, name: 'BOX-ALPHA' },
    { id: 2, name: 'BOX-BETA' },
  ]

  it('auto-selects the destination on an exact filename match (case-insensitive)', () => {
    const text = 'source_collection_name,source_position,target_position\nBOX-BETA,A01,B01'
    const file = ingestScanCsvText(cryovialScanMoveVariant, fileSource('box-alpha.csv'), text, {
      collections: boxes,
    })
    expect(file.selectedDestinationName).toBe('BOX-ALPHA')
    expect(file.inferredMatches).toEqual([{ id: 1, name: 'BOX-ALPHA', matchType: 'exact' }])
    expect(file.validationErrors).toEqual([])
    expect(file.preview).toHaveLength(1)
  })

  it('auto-proposes the filename stem as a new box when nothing matches exactly', () => {
    const text = 'source_collection_name,source_position,target_position\nBOX-BETA,A01,B01'
    const file = ingestScanCsvText(cryovialScanMoveVariant, fileSource('BOX-ALPHA-BACKUP.csv'), text, {
      collections: boxes,
    })
    expect(file.selectedDestinationName).toBe('BOX-ALPHA-BACKUP')
    expect(file.inferredDestinationName).toBe('BOX-ALPHA-BACKUP')
    expect(file.inferredMatches).toEqual([])
  })

  it('requires a manual choice when multiple boxes match the filename case-insensitively', () => {
    const text = 'source_collection_name,source_position,target_position\nBOX-BETA,A01,B01'
    const file = ingestScanCsvText(cryovialScanMoveVariant, fileSource('box-alpha.csv'), text, {
      collections: [...boxes, { id: 3, name: 'box-alpha' }],
    })
    expect(file.selectedDestinationName).toBeNull()
    expect(file.inferredMatches).toHaveLength(2)
  })
})

const scannerConfig: ScannerConfiguration = {
  id: 'cfg-1',
  name: 'Default scanner',
  barcodeColumn: 'Tube ID',
  positionType: 'single',
  positionColumn: 'Position',
  skipRows: 0,
  plateNameSource: 'filename',
}

function fullPlateCsv(emptyPositions: Set<string> = new Set()): string {
  const rows = ['Tube ID,Position']
  for (const rowLetter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    for (let col = 1; col <= 12; col++) {
      const position = `${rowLetter}${String(col).padStart(2, '0')}`
      const barcode = emptyPositions.has(position) ? '' : `BC-${position}`
      rows.push(`${barcode},${position}`)
    }
  }
  return rows.join('\n')
}

describe('micronix ingest', () => {
  const plates = [{ id: 7, name: 'PLATE-001' }]

  it('parses a full plate via the scanner config and infers the plate from the filename stem', () => {
    const file = ingestScanCsvText(
      micronixScanMoveVariant,
      fileSource('PLATE-001_2024-01-15.csv'),
      fullPlateCsv(),
      { collections: plates, scannerConfig },
    )
    expect(file.validationErrors).toEqual([])
    expect(file.csvRows).toHaveLength(96)
    expect(file.csvRows[0]).toMatchObject({ container_barcode: 'BC-A01', target_position: 'A01' })
    expect(file.selectedDestinationName).toBe('PLATE-001')
  })

  it('rejects a partial plate (full 96-well rule comes from the scanner pipeline)', () => {
    const text = 'Tube ID,Position\nBC-A01,A01'
    const file = ingestScanCsvText(micronixScanMoveVariant, fileSource('PLATE-001.csv'), text, {
      collections: plates,
      scannerConfig,
    })
    expect(file.validationErrors.some((e) => e.error.includes('all 96 well positions'))).toBe(true)
  })

  it('fails ingest without a scanner configuration', () => {
    const file = ingestScanCsvText(micronixScanMoveVariant, fileSource('PLATE-001.csv'), fullPlateCsv(), {
      collections: plates,
    })
    expect(file.validationErrors).toEqual([
      { row: 0, error: 'Select a scanner configuration before uploading files' },
    ])
  })
})

describe('ingestScanFiles', () => {
  it('returns FILES_INGESTED and converts read failures into file-level errors', async () => {
    const good = fileSource(
      'BOX-ALPHA.csv',
      'source_collection_name,source_position,target_position\nBOX-B,A01,B01',
    )
    const bad = { name: 'broken.csv', text: () => Promise.reject(new Error('unreadable')) }
    const event = await ingestScanFiles(cryovialScanMoveVariant, [good, bad], {
      collections: [{ id: 1, name: 'BOX-ALPHA' }],
    })
    if (event.type !== 'FILES_INGESTED') throw new Error('unexpected event')
    expect(event.files).toHaveLength(2)
    expect(event.files[0].validationErrors).toEqual([])
    expect(event.files[1].validationErrors).toEqual([{ row: 0, error: 'unreadable' }])
  })
})
