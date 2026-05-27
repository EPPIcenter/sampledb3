import { describe, it, expect } from 'vitest'
import {
  buildLocationTree,
  getLocationLabel,
  filterLocationTree,
  getRootLocations,
  getLocationChildren,
  getLocationAncestors,
  getLocationDescendants,
  parseLocationPathSegments,
  getLocationSearchHighlightQuery,
} from '../location-tree'
import type { Location } from '../api/types'

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

  describe('parseLocationPathSegments and path filter', () => {
    it('returns null for single-segment (flat) queries', () => {
      expect(parseLocationPathSegments('Soper')).toBeNull()
      expect(parseLocationPathSegments('  a  ')).toBeNull()
    })

    it('splits on > and / and trims', () => {
      expect(parseLocationPathSegments('Soper > 5 > A')).toEqual(['Soper', '5', 'A'])
      expect(parseLocationPathSegments('Soper/5/A')).toEqual(['Soper', '5', 'A'])
      expect(parseLocationPathSegments('Soper > 5/A')).toEqual(['Soper', '5', 'A'])
    })

    it('getLocationSearchHighlightQuery returns last path segment in path mode', () => {
      expect(getLocationSearchHighlightQuery('X > Y > z')).toBe('z')
      expect(getLocationSearchHighlightQuery('plain')).toBe('plain')
    })

    it('path mode narrows to a subtree: Soper > 5 > A', () => {
      const locations: Location[] = [
        mockLocation(1, 'Soper', null),
        mockLocation(2, 'Shelf 5', 1),
        mockLocation(3, 'A-01', 2),
        mockLocation(4, 'A-02', 2),
        mockLocation(5, 'Other', null),
        mockLocation(6, 'A-99', 5),
      ]
      const tree = buildLocationTree(locations)
      const filtered = filterLocationTree(tree, 'Soper > 5 > A')
      const allLocs = Array.from(filtered.values()).flat()
      const names = allLocs.map((l) => l.name)
      expect(names).toEqual(expect.arrayContaining(['A-01', 'A-02', 'Shelf 5', 'Soper']))
      expect(names).not.toContain('A-99')
      expect(names).not.toContain('Other')
    })

    it('path with slashes matches the same as >', () => {
      const locations: Location[] = [
        mockLocation(1, 'Soper', null),
        mockLocation(2, '5', 1),
        mockLocation(3, 'A1', 2),
      ]
      const tree = buildLocationTree(locations)
      const a = filterLocationTree(tree, 'Soper/5/A')
      const b = filterLocationTree(tree, 'Soper > 5 > A')
      const setA = new Set(Array.from(a.values()).flat().map((l) => l.id))
      const setB = new Set(Array.from(b.values()).flat().map((l) => l.id))
      expect(setA).toEqual(setB)
    })

    it('flat search "A" still can match in another branch; path "Soper > 5 > A" does not pull Other', () => {
      const locations: Location[] = [
        mockLocation(1, 'Soper', null),
        mockLocation(2, '5', 1),
        mockLocation(3, 'Axel', 2),
        mockLocation(10, 'SoperB', null),
        mockLocation(11, 'X', 10),
        mockLocation(12, 'Afar', 11),
      ]
      const tree = buildLocationTree(locations)
      const pathFiltered = filterLocationTree(tree, 'Soper > 5 > A')
      const pathNames = Array.from(pathFiltered.values())
        .flat()
        .map((l) => l.name)
      expect(pathNames).toContain('Axel')
      expect(pathNames).not.toContain('Afar')

      const flat = filterLocationTree(tree, 'A')
      const flatNames = new Set(
        Array.from(flat.values())
          .flat()
          .map((l) => l.name)
      )
      expect(flatNames.has('Axel') && flatNames.has('Afar')).toBe(true)
    })

    it('digit segment 5 does not match name 15 as a sibling', () => {
      const locations: Location[] = [
        mockLocation(1, 'Soper', null),
        mockLocation(2, '5', 1),
        mockLocation(3, '15', 1),
        mockLocation(4, 'A01', 2),
        mockLocation(5, 'A01', 3),
      ]
      const tree = buildLocationTree(locations)
      const pathFiltered = filterLocationTree(tree, 'Soper > 5 > A01')
      const names = new Set(
        Array.from(pathFiltered.values())
          .flat()
          .map((l) => l.name)
      )
      expect(names).toContain('5')
      expect(names).toContain('A01')
      expect(names.has('15')).toBe(false)
    })

    it('path with only two levels includes full subtree under the last match', () => {
      const locations: Location[] = [
        mockLocation(1, 'Soper', null),
        mockLocation(2, '5', 1),
        mockLocation(3, 'A01', 2),
        mockLocation(4, 'Deep-child', 3),
      ]
      const tree = buildLocationTree(locations)
      const filtered = filterLocationTree(tree, 'Soper > 5')
      const names = new Set(
        Array.from(filtered.values())
          .flat()
          .map((l) => l.name)
      )
      expect([...names].sort()).toEqual(['5', 'A01', 'Deep-child', 'Soper'].sort())
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
