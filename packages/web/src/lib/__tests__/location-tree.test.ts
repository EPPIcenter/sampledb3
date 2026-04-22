import { describe, it, expect } from 'vitest'
import {
  buildLocationTree,
  getLocationLabel,
  filterLocationTree,
  getRootLocations,
  getLocationChildren,
  getLocationAncestors,
  getLocationDescendants,
} from '../location-tree'
import type { Location } from '../api'

const mockLocation = (id: number, name: string, parentId: number | null, path?: string, description?: string): Location =>
  ({
    id,
    name,
    parentId,
    path: path ?? name,
    description: description ?? undefined,
    storageTypeId: parentId === null ? '1' : null,
    canContainCollections: false,
    created: '',
    lastUpdated: '',
  })

describe('location-tree', () => {
  describe('buildLocationTree', () => {
    it('groups locations by parent_id and sorts by name', () => {
      const locations: Location[] = [
        mockLocation(1, 'Root', null),
        mockLocation(2, 'ChildB', 1),
        mockLocation(3, 'ChildA', 1),
      ]
      const tree = buildLocationTree(locations)
      expect(tree.has(null)).toBe(true)
      expect(tree.get(null)!.map(l => l.name)).toEqual(['Root'])
      expect(tree.has(1)).toBe(true)
      expect(tree.get(1)!.map(l => l.name)).toEqual(['ChildA', 'ChildB'])
    })
  })

  describe('getLocationLabel', () => {
    it('returns location name', () => {
      const loc = mockLocation(1, 'Freezer A', null)
      expect(getLocationLabel(loc)).toBe('Freezer A')
    })
  })

  describe('filterLocationTree', () => {
    it('returns full tree when search term is empty', () => {
      const locations: Location[] = [
        mockLocation(1, 'Root', null),
        mockLocation(2, 'Child', 1),
      ]
      const tree = buildLocationTree(locations)
      const filtered = filterLocationTree(tree, '  ')
      expect(filtered.size).toBe(tree.size)
    })

    it('includes matching locations and their ancestors', () => {
      const locations: Location[] = [
        mockLocation(1, 'Root', null),
        mockLocation(2, 'Freezer', 1),
        mockLocation(3, 'Shelf A', 2),
      ]
      const tree = buildLocationTree(locations)
      const filtered = filterLocationTree(tree, 'Shelf')
      expect(filtered.size).toBeGreaterThan(0)
      const allLocs = Array.from(filtered.values()).flat()
      const names = allLocs.map(l => l.name)
      expect(names).toContain('Shelf A')
      expect(names).toContain('Freezer')
      expect(names).toContain('Root')
    })
  })

  describe('getRootLocations', () => {
    it('returns locations with null parentId', () => {
      const locations: Location[] = [
        mockLocation(1, 'Root1', null),
        mockLocation(2, 'Root2', null),
        mockLocation(3, 'Child', 1),
      ]
      const roots = getRootLocations(locations)
      expect(roots).toHaveLength(2)
      expect(roots.map(r => r.name).sort()).toEqual(['Root1', 'Root2'])
    })
  })

  describe('getLocationChildren', () => {
    it('returns locations with given parentId', () => {
      const locations: Location[] = [
        mockLocation(1, 'Root', null),
        mockLocation(2, 'Child1', 1),
        mockLocation(3, 'Child2', 1),
      ]
      const children = getLocationChildren(locations, 1)
      expect(children).toHaveLength(2)
      expect(children.map(c => c.name).sort()).toEqual(['Child1', 'Child2'])
    })
  })

  describe('getLocationAncestors', () => {
    it('returns ancestors from root to parent', () => {
      const locations: Location[] = [
        mockLocation(1, 'Root', null),
        mockLocation(2, 'Mid', 1),
        mockLocation(3, 'Leaf', 2),
      ]
      const ancestors = getLocationAncestors(locations, 3)
      expect(ancestors).toHaveLength(2)
      expect(ancestors[0].name).toBe('Root')
      expect(ancestors[1].name).toBe('Mid')
    })
  })

  describe('getLocationDescendants', () => {
    it('returns all descendants', () => {
      const locations: Location[] = [
        mockLocation(1, 'Root', null),
        mockLocation(2, 'Child', 1),
        mockLocation(3, 'Grandchild', 2),
      ]
      const descendants = getLocationDescendants(locations, 1)
      expect(descendants).toHaveLength(2)
      expect(descendants.map(d => d.name).sort()).toEqual(['Child', 'Grandchild'])
    })
  })
})
