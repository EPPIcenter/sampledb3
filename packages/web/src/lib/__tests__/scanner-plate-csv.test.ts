import { describe, it, expect } from 'vitest'
import { parseScannerPlateCsv, validateScannerPlateCsv } from '../scanner-plate-csv'
import type { ScannerConfiguration } from '../api/settings'

const singleConfig: ScannerConfiguration = {
  id: 'cfg-single',
  name: 'Single position',
  barcodeColumn: 'container_barcode',
  positionType: 'single',
  positionColumn: 'target_position',
  skipRows: 0,
  isDefault: true,
}

const combinedConfig: ScannerConfiguration = {
  id: 'cfg-combined',
  name: 'Row/column',
  barcodeColumn: 'tube_id',
  positionType: 'combined',
  rowColumn: 'row',
  columnColumn: 'col',
  skipRows: 1,
  isDefault: false,
}

/** Full 96-well CSV; overrides map position -> barcode (empty = empty well). */
function fullPlateCsv(overrides: Record<string, string> = {}, omit: string[] = []): string {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((row) =>
    Array.from({ length: 12 }, (_, i) => `${row}${(i + 1).toString().padStart(2, '0')}`),
  )
  const lines = rows
    .filter((pos) => !omit.includes(pos))
    .map((pos) => `${overrides[pos] ?? ''},${pos}`)
  return 'container_barcode,target_position\n' + lines.join('\n')
}

describe('parseScannerPlateCsv', () => {
  it('maps configured columns onto container_barcode / target_position', () => {
    const rows = parseScannerPlateCsv('container_barcode,target_position\nMTX1,A01\n,B02', singleConfig)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ container_barcode: 'MTX1', target_position: 'A01' })
    expect(rows[1]).toMatchObject({ container_barcode: '', target_position: 'B02' })
  })

  it('reads quoted scanner exports', () => {
    const rows = parseScannerPlateCsv('"container_barcode","target_position"\r\n"MTX1","A01"', singleConfig)
    expect(rows[0]).toMatchObject({ container_barcode: 'MTX1', target_position: 'A01' })
  })

  it('returns no rows for an empty or header-only file', () => {
    expect(parseScannerPlateCsv('', singleConfig)).toEqual([])
    expect(parseScannerPlateCsv('container_barcode,target_position', singleConfig)).toEqual([])
  })

  it('skips configured rows and combines row/column with zero-padding', () => {
    const text = 'Scanner export v2\nrow,col,tube_id\nA,1,MTX1\nB,12,MTX2'
    const rows = parseScannerPlateCsv(text, combinedConfig)
    expect(rows.map((r) => r.target_position)).toEqual(['A01', 'B12'])
    expect(rows.map((r) => r.container_barcode)).toEqual(['MTX1', 'MTX2'])
  })
})

describe('validateScannerPlateCsv', () => {
  it('rejects an empty file', () => {
    const result = validateScannerPlateCsv([], singleConfig)
    expect(result.valid).toBe(false)
    expect(result.errors[0].error).toMatch(/CSV file is empty/)
  })

  it('accepts a full 96-well plate (barcodes may be empty)', () => {
    const rows = parseScannerPlateCsv(fullPlateCsv({ A01: 'MTX1' }), singleConfig)
    expect(validateScannerPlateCsv(rows, singleConfig)).toEqual({ valid: true, errors: [] })
  })

  it('rejects a plate missing positions', () => {
    const rows = parseScannerPlateCsv(fullPlateCsv({}, ['H12']), singleConfig)
    const result = validateScannerPlateCsv(rows, singleConfig)
    expect(result.valid).toBe(false)
    expect(result.errors[0].error).toMatch(/all 96 well positions/)
    expect(result.errors[0].error).toMatch(/Missing: H12/)
  })

  it('rejects duplicate positions (only 95 distinct)', () => {
    const text = fullPlateCsv({}, ['H12']) + '\n,A01'
    const rows = parseScannerPlateCsv(text, singleConfig)
    const result = validateScannerPlateCsv(rows, singleConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual({ row: 96, error: 'Position A01 appears more than once (also row 1)' })
    expect(result.errors.some((e) => /Found 95 valid position/.test(e.error))).toBe(true)
  })

  // Traxcer exports (examples/move-micronix-test): "Tube ID,Position", unpadded wells.
  const traxcerConfig: ScannerConfiguration = {
    id: 'cfg-traxcer',
    name: 'Traxcer',
    barcodeColumn: 'Tube ID',
    positionType: 'single',
    positionColumn: 'Position',
    skipRows: 0,
    isDefault: true,
  }

  /** Full plate in Traxcer form with unpadded positions (A1 … H12). */
  function traxcerPlate(barcodes: Record<string, string>, positionOverride: Record<string, string> = {}): string {
    const lines = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((row) =>
      Array.from({ length: 12 }, (_, i) => {
        const pos = `${row}${i + 1}`
        return `${barcodes[pos] ?? ''},${positionOverride[pos] ?? pos}`
      }),
    )
    return 'Tube ID,Position\n' + lines.join('\n')
  }

  it('accepts unpadded scanner positions like A1', () => {
    const rows = parseScannerPlateCsv(traxcerPlate({ A1: '1043659134', A2: '1106665111' }), traxcerConfig)
    expect(validateScannerPlateCsv(rows, traxcerConfig)).toEqual({ valid: true, errors: [] })
  })

  it('catches A1 and A01 in one scan as the same well', () => {
    // Row 2 (A2) is written as a01, so A01 appears twice and A02 is missing.
    const rows = parseScannerPlateCsv(traxcerPlate({}, { A2: 'a01' }), traxcerConfig)
    const result = validateScannerPlateCsv(rows, traxcerConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual({ row: 2, error: 'Position A01 appears more than once (also row 1)' })
  })

  it('rejects the same barcode in two wells', () => {
    const rows = parseScannerPlateCsv(traxcerPlate({ A1: '1043659134', C7: '1043659134' }), traxcerConfig)
    const result = validateScannerPlateCsv(rows, traxcerConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      { row: 31, error: 'Barcode 1043659134 appears more than once (also row 1)' },
    ])
  })

  it('rejects invalid well positions like I01', () => {
    const text = fullPlateCsv({}, ['H12']) + '\n,I01'
    const rows = parseScannerPlateCsv(text, singleConfig)
    const result = validateScannerPlateCsv(rows, singleConfig)
    expect(result.valid).toBe(false)
    expect(result.errors[0].error).toMatch(/all 96 well positions/)
  })

  it('requires the position column on every row, naming the configured column', () => {
    const rows = parseScannerPlateCsv('container_barcode,target_position\nMTX1,', singleConfig)
    const result = validateScannerPlateCsv(rows, singleConfig)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatchObject({ row: 1 })
    expect(result.errors[0].error).toMatch(/Position column "target_position".*required/)
  })
})
