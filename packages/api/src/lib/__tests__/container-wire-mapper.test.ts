import { describe, expect, it } from 'bun:test'
import { mapEnrichedContainerToWire } from '../container-wire-mapper'
import type { EnrichedContainerApi } from '../container-api-enrichment'

describe('mapEnrichedContainerToWire', () => {
  it('maps paper container with sublabel at root and sheet collection without position', () => {
    const enriched = {
      id: 94079,
      specimenId: 1,
      unitId: 1,
      totalQuantity: 1,
      remainingQuantity: 1,
      comment: null,
      created: '2024-01-01',
      lastUpdated: '2024-01-01',
      containerType: 'paper' as const,
      tags: [],
      unit: undefined,
      location: null,
      locationPath: '/Box/Sheet',
      collection: {
        type: 'sheet' as const,
        id: 143,
        name: '2058121',
        position: null,
        barcode: 'Spot-1',
      },
      paper: {
        sublabel: 'Spot-1',
        sheetId: 143,
        sheetName: '2058121',
        boxId: 1,
        bagId: null,
      },
    } satisfies EnrichedContainerApi

    expect(mapEnrichedContainerToWire(enriched)).toEqual({
      id: 94079,
      specimenId: 1,
      unitId: 1,
      totalQuantity: 1,
      remainingQuantity: 1,
      created: '2024-01-01',
      lastUpdated: '2024-01-01',
      containerType: 'paper',
      tags: [],
      locationPath: '/Box/Sheet',
      sublabel: 'Spot-1',
      collection: { type: 'sheet', id: 143, name: '2058121' },
    })
  })

  it('omits sublabel when paper spot identifier is unset', () => {
    const enriched = {
      id: 2,
      specimenId: 1,
      unitId: 1,
      totalQuantity: 1,
      remainingQuantity: 1,
      comment: null,
      created: '2024-01-01',
      lastUpdated: '2024-01-01',
      containerType: 'paper' as const,
      tags: [],
      unit: undefined,
      location: null,
      locationPath: '',
      collection: { type: 'sheet' as const, id: 1, name: 'S1', position: null, barcode: null },
      paper: {
        sublabel: null,
        sheetId: 1,
        sheetName: 'S1',
        boxId: null,
        bagId: null,
      },
    } satisfies EnrichedContainerApi

    const wire = mapEnrichedContainerToWire(enriched)
    expect(wire).not.toHaveProperty('sublabel')
    expect(wire.collection).toEqual({ type: 'sheet', id: 1, name: 'S1' })
  })

  it('maps micronix tube barcode to root and keeps position on collection', () => {
    const enriched = {
      id: 3,
      specimenId: 1,
      unitId: 1,
      totalQuantity: 1,
      remainingQuantity: 1,
      comment: null,
      created: '2024-01-01',
      lastUpdated: '2024-01-01',
      containerType: 'micronix_tube' as const,
      tags: [],
      unit: undefined,
      location: null,
      locationPath: '/Freezer',
      collection: {
        type: 'micronix_plate' as const,
        id: 10,
        name: 'Plate1',
        position: 'A01',
        barcode: 'MTX-001',
      },
      micronixTube: {
        barcode: 'MTX-001',
        position: 'A01',
        plateId: 10,
        plateName: 'Plate1',
        locationId: 1,
      },
    } satisfies EnrichedContainerApi

    expect(mapEnrichedContainerToWire(enriched)).toMatchObject({
      containerType: 'micronix_tube',
      barcode: 'MTX-001',
      collection: { type: 'micronix_plate', id: 10, name: 'Plate1', position: 'A01' },
    })
  })
})
