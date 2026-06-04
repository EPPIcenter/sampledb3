import { describe, expect, it } from 'vitest'
import {
  containerDisplayIdentifier,
  containerDisplayLabel,
  hasContainerDisplayIdentifier,
} from '../container-display'

describe('containerDisplayIdentifier', () => {
  it('returns barcode for micronix tubes', () => {
    expect(
      containerDisplayIdentifier({ containerType: 'micronix_tube', barcode: 'MTX-001' }),
    ).toBe('MTX-001')
  })

  it('returns sublabel for paper', () => {
    expect(
      containerDisplayIdentifier({
        containerType: 'paper',
        sublabel: 'Spot-A',
        collection: { type: 'sheet', id: 1, name: 'Sheet1' },
      }),
    ).toBe('Spot-A')
  })

  it('does not read collection.barcode', () => {
    expect(
      containerDisplayIdentifier({
        containerType: 'micronix_tube',
        collection: { type: 'micronix_plate', id: 1, name: 'P1', position: 'A01' },
      }),
    ).toBeUndefined()
  })
})

describe('containerDisplayLabel', () => {
  it('prefers identity over placement', () => {
    expect(
      containerDisplayLabel({
        containerType: 'paper',
        sublabel: 'Spot-A',
        collection: { type: 'sheet', id: 1, name: '2058121' },
      }),
    ).toBe('Spot-A')
  })

  it('falls back to grid position then collection name', () => {
    expect(
      containerDisplayLabel({
        containerType: 'static_well',
        collection: { type: 'micronix_plate', id: 1, name: 'Plate1', position: 'B02' },
      }),
    ).toBe('B02')

    expect(
      containerDisplayLabel({
        containerType: 'static_well',
        collection: { type: 'micronix_plate', id: 1, name: 'Plate1' },
      }),
    ).toBe('Plate1')
  })
})

describe('hasContainerDisplayIdentifier', () => {
  it('is true when variant root identity is set', () => {
    expect(hasContainerDisplayIdentifier({ containerType: 'cryovial_tube', barcode: 'CV-1' })).toBe(true)
    expect(hasContainerDisplayIdentifier({ containerType: 'static_well' })).toBe(false)
  })
})
