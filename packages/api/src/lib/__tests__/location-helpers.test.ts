import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestLocation, createTestStorageType } from '../../__tests__/helpers/factories'
import {
  buildLocationTree,
  getLocationsForCollections,
  validateLocationHierarchy,
  getLocationChildren,
  getLocationStorageTypeId,
} from '../location-helpers'
import type { Database } from '../../db/client'

describe('location-helpers', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('buildLocationTree', () => {
    it('groups locations by parent_id', () => {
      const locations = [
        { id: 1, parentId: null, name: 'Root', storageTypeId: '1', description: null, canContainCollections: false, path: 'Root', created: '', lastUpdated: '', createdBy: null, updatedBy: null },
        { id: 2, parentId: 1, name: 'Child', storageTypeId: null, description: null, canContainCollections: false, path: null, created: '', lastUpdated: '', createdBy: null, updatedBy: null },
      ]
      const tree = buildLocationTree(locations)
      expect(tree.has(null)).toBe(true)
      expect(tree.get(null)!.length).toBe(1)
      expect(tree.get(null)![0].name).toBe('Root')
      expect(tree.has(1)).toBe(true)
      expect(tree.get(1)!.length).toBe(1)
      expect(tree.get(1)![0].name).toBe('Child')
    })
  })

  describe('getLocationsForCollections', () => {
    it('returns only locations with canContainCollections true', async () => {
      const st = await createTestStorageType(testDb, { name: 'Shelf' })
      await createTestLocation(testDb, {
        name: 'NoCollections',
        storageTypeId: String(st.id),
        canContainCollections: false,
      })
      await createTestLocation(testDb, {
        name: 'WithCollections',
        storageTypeId: String(st.id),
        canContainCollections: true,
      })
      const locs = await getLocationsForCollections(testDb)
      expect(locs.length).toBeGreaterThanOrEqual(1)
      expect(locs.every(l => l.canContainCollections)).toBe(true)
    })
  })

  describe('validateLocationHierarchy', () => {
    it('returns null when parentId is null', async () => {
      if (!sqlite) return
      const err = await validateLocationHierarchy(testDb, sqlite, null)
      expect(err).toBe(null)
    })

    it('returns error when parent is self', async () => {
      if (!sqlite) return
      const err = await validateLocationHierarchy(testDb, sqlite, 1, 1)
      expect(err).toContain('own parent')
    })
  })

  describe('getLocationChildren', () => {
    it('returns direct children of location', async () => {
      const st = await createTestStorageType(testDb, { name: 'Shelf' })
      const root = await createTestLocation(testDb, {
        name: 'Root',
        storageTypeId: String(st.id),
      })
      await createTestLocation(testDb, {
        name: 'Child1',
        parentId: root.id,
      })
      await createTestLocation(testDb, {
        name: 'Child2',
        parentId: root.id,
      })
      const children = await getLocationChildren(testDb, root.id)
      expect(children.length).toBe(2)
      expect(children.map(c => c.name).sort()).toEqual(['Child1', 'Child2'])
    })
  })

  describe('getLocationStorageTypeId', () => {
    it('returns storageTypeId for root location', async () => {
      const st = await createTestStorageType(testDb, { name: 'Shelf' })
      const root = await createTestLocation(testDb, {
        name: 'Root',
        storageTypeId: String(st.id),
      })
      const id = await getLocationStorageTypeId(testDb, root.id)
      expect(id).toBe(String(st.id))
    })

    it('returns null for non-existent location', async () => {
      const id = await getLocationStorageTypeId(testDb, 99999)
      expect(id).toBe(null)
    })
  })
})
