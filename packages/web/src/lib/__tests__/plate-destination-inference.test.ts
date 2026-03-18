import { describe, it, expect } from 'vitest'
import { inferDestinationPlateForScan, plateNameSourceSummary } from '../plate-destination-inference'
import type { ScannerConfiguration } from '../api'

const baseConfig: ScannerConfiguration = {
  id: '1',
  name: 'test',
  barcodeColumn: 'B',
  positionType: 'single',
  positionColumn: 'P',
  skipRows: 0,
}

const plates = [
  { id: 1, name: 'PLATE-A' },
  { id: 2, name: 'OTHER' },
]

const platesWithPrefixSibling = [
  { id: 1, name: 'PLATE-A' },
  { id: 2, name: 'PLATE-A-BACKUP' },
  { id: 3, name: 'OTHER' },
]

describe('inferDestinationPlateForScan', () => {
  it('uses filename when plateNameSource omitted', () => {
    const r = inferDestinationPlateForScan('PLATE-A_20240101.csv', [], baseConfig, plates)
    expect(r.selectedPlateName).toBe('PLATE-A')
    expect(r.plateInferenceErrors).toHaveLength(0)
  })

  it('auto-selects exact plate when stem also matches longer plate names', () => {
    const r = inferDestinationPlateForScan(
      'PLATE-A_20240101.csv',
      [],
      baseConfig,
      platesWithPrefixSibling
    )
    expect(r.selectedPlateName).toBe('PLATE-A')
    expect(r.inferredMatches.some((m) => m.name === 'PLATE-A-BACKUP')).toBe(true)
  })

  it('does not auto-select when two plates share the same name case-insensitively', () => {
    const dup = [
      { id: 1, name: 'PLATE-A' },
      { id: 2, name: 'plate-a' },
    ]
    const r = inferDestinationPlateForScan('PLATE-A.csv', [], baseConfig, dup)
    expect(r.selectedPlateName).toBeNull()
    expect(r.inferredMatches.filter((m) => m.matchType === 'exact')).toHaveLength(2)
  })

  it('column mode: single plate name matches', () => {
    const rows = [
      { B: '1', P: 'A01', Rack: 'PLATE-A' },
      { B: '2', P: 'A02', Rack: 'PLATE-A' },
    ]
    const r = inferDestinationPlateForScan(
      'scan.csv',
      rows,
      { ...baseConfig, plateNameSource: 'column', plateNameColumn: 'Rack' },
      plates
    )
    expect(r.plateInferenceErrors).toHaveLength(0)
    expect(r.selectedPlateName).toBe('PLATE-A')
  })

  it('column mode: inconsistent names errors', () => {
    const rows = [
      { B: '1', P: 'A01', Rack: 'PLATE-A' },
      { B: '2', P: 'A02', Rack: 'OTHER' },
    ]
    const r = inferDestinationPlateForScan(
      'scan.csv',
      rows,
      { ...baseConfig, plateNameSource: 'column', plateNameColumn: 'Rack' },
      plates
    )
    expect(r.plateInferenceErrors.length).toBe(1)
    expect(r.plateInferenceErrors[0].error).toContain('Inconsistent')
    expect(r.selectedPlateName).toBeNull()
  })

  it('column mode: empty column errors', () => {
    const rows = [{ B: '1', P: 'A01', Rack: '' }]
    const r = inferDestinationPlateForScan(
      'scan.csv',
      rows,
      { ...baseConfig, plateNameSource: 'column', plateNameColumn: 'Rack' },
      plates
    )
    expect(r.plateInferenceErrors.length).toBe(1)
    expect(r.plateInferenceErrors[0].error).toContain('No non-empty')
  })

  it('column mode: missing config column setting', () => {
    const r = inferDestinationPlateForScan(
      'x.csv',
      [{ P: 'A01' }],
      { ...baseConfig, plateNameSource: 'column' },
      plates
    )
    expect(r.plateInferenceErrors[0].error).toContain('no plate name column')
  })
})

describe('plateNameSourceSummary', () => {
  it('describes filename default', () => {
    expect(plateNameSourceSummary(baseConfig)).toBe('Plate: filename')
  })

  it('describes column', () => {
    expect(
      plateNameSourceSummary({
        ...baseConfig,
        plateNameSource: 'column',
        plateNameColumn: 'RackID',
      })
    ).toBe('Plate: column "RackID"')
  })
})
