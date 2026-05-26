import { describe, it, expect } from 'bun:test'
import { buildInventoryBreakdown } from '../container-enrichment'
import type { ContainerPlacement, StorageContainerSummaryRow } from '../container-enrichment'

describe('buildInventoryBreakdown', () => {
  it('aggregates by container type and unit', () => {
    const placementMap = new Map<number, ContainerPlacement>([
      [
        1,
        {
          containerType: 'micronix_tube',
          collection: { type: 'micronix_plate', id: 10, name: 'Plate 1', position: null },
          location: { id: 1, name: 'Lab', path: 'Lab' },
          parentCollection: null,
          locationPath: 'Lab',
        },
      ],
      [
        2,
        {
          containerType: 'micronix_tube',
          collection: { type: 'micronix_plate', id: 10, name: 'Plate 1', position: null },
          location: { id: 1, name: 'Lab', path: 'Lab' },
          parentCollection: null,
          locationPath: 'Lab',
        },
      ],
    ])
    const containers: StorageContainerSummaryRow[] = [
      { id: 1, specimenId: 1, totalQuantity: 100, remainingQuantity: 50, unitSymbol: 'µL' },
      { id: 2, specimenId: 1, totalQuantity: 100, remainingQuantity: 30, unitSymbol: 'µL' },
    ]
    const inventory = buildInventoryBreakdown(containers, placementMap)
    expect(inventory).toHaveLength(1)
    expect(inventory[0]).toMatchObject({
      type: 'micronix_tube',
      unit: 'µL',
      totalQuantity: 200,
      remainingQuantity: 80,
      containerCount: 2,
      collections: ['Plate 1'],
      locationPaths: ['Lab'],
    })
  })
})
