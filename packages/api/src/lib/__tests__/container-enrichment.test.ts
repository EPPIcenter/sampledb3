import { describe, it, expect } from 'bun:test'
import { formatLocationPath, buildInventoryBreakdown } from '../container-enrichment'
import type { ContainerPlacementInfo, StorageContainerSummaryRow } from '../container-enrichment'

describe('formatLocationPath', () => {
  it('returns materialized path when present', () => {
    expect(formatLocationPath({ path: 'Lab > Freezer' })).toBe('Lab > Freezer')
    expect(formatLocationPath({ locationPath: 'Lab > Freezer' })).toBe('Lab > Freezer')
  })

  it('appends parent collection name with arrow', () => {
    expect(formatLocationPath({ path: 'Lab' }, 'Plate A')).toBe('Lab → Plate A')
  })

  it('falls back to location name then parent name', () => {
    expect(formatLocationPath({ locationName: 'Room 1' }, 'Box 2')).toBe('Room 1 → Box 2')
    expect(formatLocationPath(null, 'Orphan')).toBe('Orphan')
    expect(formatLocationPath(undefined)).toBeUndefined()
  })
})

describe('buildInventoryBreakdown', () => {
  it('aggregates by container type and unit', () => {
    const info = new Map<number, ContainerPlacementInfo>([
      [1, { type: 'micronix_tube', collectionName: 'Plate 1', id: 10, locationPath: 'Lab' }],
      [2, { type: 'micronix_tube', collectionName: 'Plate 1', id: 10, locationPath: 'Lab' }],
    ])
    const containers: StorageContainerSummaryRow[] = [
      { id: 1, specimenId: 1, totalQuantity: 100, remainingQuantity: 50, unitSymbol: 'µL' },
      { id: 2, specimenId: 1, totalQuantity: 100, remainingQuantity: 30, unitSymbol: 'µL' },
    ]
    const inventory = buildInventoryBreakdown(containers, info)
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
