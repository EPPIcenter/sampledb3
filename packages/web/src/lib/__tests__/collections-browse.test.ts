import { describe, it, expect } from 'vitest'
import { filterCollections } from '../collections-browse'
import type { CollectionListItem } from '../collections-browse'

const mockCollection = (
  id: number,
  name: string,
  type: CollectionListItem['type'],
  overrides: Partial<CollectionListItem> = {}
): CollectionListItem => ({
  id,
  name,
  type,
  barcode: null,
  locationId: null,
  itemCount: 0,
  location: null,
  ...overrides,
})

describe('filterCollections', () => {
  const allTypes: CollectionListItem[] = [
    mockCollection(1, 'Plate Alpha', 'micronix_plate', { barcode: 'PLT-001', location: { id: 1, path: '/Freezer A/Shelf 1' } }),
    mockCollection(2, 'Cryo Box Beta', 'cryovial_box', { location: { id: 2, path: '/Freezer B' } }),
    mockCollection(3, 'Generic Box Gamma', 'box'),
    mockCollection(4, 'Bag Delta', 'bag', { location: { id: 3, path: '/Room 1/Cabinet' } }),
  ]

  it('returns all collections when type is all and search is empty', () => {
    const result = filterCollections(allTypes, '', 'all')
    expect(result).toHaveLength(4)
    expect(result.map((c) => c.name)).toEqual(['Plate Alpha', 'Cryo Box Beta', 'Generic Box Gamma', 'Bag Delta'])
  })

  it('returns all collections when search is only whitespace', () => {
    const result = filterCollections(allTypes, '   ', 'all')
    expect(result).toHaveLength(4)
  })

  it('filters by type when typeFilter is not all', () => {
    expect(filterCollections(allTypes, '', 'micronix_plate')).toHaveLength(1)
    expect(filterCollections(allTypes, '', 'micronix_plate')[0].name).toBe('Plate Alpha')
    expect(filterCollections(allTypes, '', 'cryovial_box')).toHaveLength(1)
    expect(filterCollections(allTypes, '', 'box')).toHaveLength(1)
    expect(filterCollections(allTypes, '', 'bag')).toHaveLength(1)
  })

  it('matches search against name (case-insensitive)', () => {
    const result = filterCollections(allTypes, 'alpha', 'all')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Plate Alpha')
    expect(filterCollections(allTypes, 'CRYO', 'all')).toHaveLength(1)
    expect(filterCollections(allTypes, 'gamma', 'all')[0].name).toBe('Generic Box Gamma')
  })

  it('matches search against barcode when present', () => {
    const result = filterCollections(allTypes, 'PLT-001', 'all')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Plate Alpha')
    expect(filterCollections(allTypes, 'plt', 'all')).toHaveLength(1)
  })

  it('matches search against location path', () => {
    const result = filterCollections(allTypes, 'Freezer A', 'all')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Plate Alpha')
    expect(filterCollections(allTypes, 'Room 1', 'all')).toHaveLength(1)
    expect(filterCollections(allTypes, 'Cabinet', 'all')[0].name).toBe('Bag Delta')
  })

  it('returns empty array when no collections match search', () => {
    const result = filterCollections(allTypes, 'nonexistent', 'all')
    expect(result).toHaveLength(0)
  })

  it('combines type filter and search', () => {
    const result = filterCollections(allTypes, 'box', 'cryovial_box')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Cryo Box Beta')
    expect(filterCollections(allTypes, 'alpha', 'micronix_plate')).toHaveLength(1)
    expect(filterCollections(allTypes, 'alpha', 'bag')).toHaveLength(0)
  })

  it('sorts exact name match first, then prefix, then contains', () => {
    const collections: CollectionListItem[] = [
      mockCollection(10, 'box10', 'box'),
      mockCollection(11, 'box100', 'box'),
      mockCollection(12, 'mybox1', 'box'),
      mockCollection(1, 'box1', 'box'),
      mockCollection(13, 'box11', 'box'),
    ]
    const result = filterCollections(collections, 'box1', 'all')
    expect(result.map((c) => c.name)).toEqual([
      'box1',     // exact
      'box10',    // prefix
      'box100',   // prefix
      'box11',    // prefix
      'mybox1',   // contains
    ])
  })

  it('sorts case-insensitively and puts exact match first', () => {
    const collections: CollectionListItem[] = [
      mockCollection(2, 'PlateAlpha', 'micronix_plate'),
      mockCollection(1, 'plate1', 'micronix_plate'),
      mockCollection(3, 'MyPlate1', 'micronix_plate'),
    ]
    const result = filterCollections(collections, 'Plate1', 'all')
    expect(result[0].name).toBe('plate1')
  })

  it('preserves original order when search is empty', () => {
    const collections: CollectionListItem[] = [
      mockCollection(3, 'Zebra', 'box'),
      mockCollection(1, 'Alpha', 'box'),
      mockCollection(2, 'Middle', 'box'),
    ]
    const result = filterCollections(collections, '', 'all')
    expect(result.map((c) => c.name)).toEqual(['Zebra', 'Alpha', 'Middle'])
  })
})
