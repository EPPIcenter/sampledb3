import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestLocation, createTestStorageType, createTestMicronixPlate } from '../../__tests__/helpers/factories'
import { resolveLocationByPath, executeCollectionMoves } from '../collection-move'
import type { Database } from '../../db/client'
import { micronixPlate } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('collection-move', () => {
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

  describe('resolveLocationByPath', () => {
    it('returns null for empty path', async () => {
      const id = await resolveLocationByPath(testDb, '')
      expect(id).toBe(null)
    })

    it('returns null when no location matches path', async () => {
      const id = await resolveLocationByPath(testDb, 'NonExistent/Path')
      expect(id).toBe(null)
    })

    it('returns location id when path matches', async () => {
      const st = await createTestStorageType(testDb, { name: 'Shelf', description: 'Test' })
      const loc = await createTestLocation(testDb, {
        name: 'Root',
        storageTypeId: String(st.id),
        path: 'Root',
      })
      const id = await resolveLocationByPath(testDb, 'Root')
      expect(id).toBe(loc.id)
    })
  })

  describe('executeCollectionMoves', () => {
    it('moves micronix plate from one location to another', async () => {
      const st = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc1 = await createTestLocation(testDb, {
        name: 'Loc1',
        storageTypeId: String(st.id),
        canContainCollections: true,
      })
      const loc2 = await createTestLocation(testDb, {
        name: 'Loc2',
        storageTypeId: String(st.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'PlateA', locationId: loc1.id })

      const result = await executeCollectionMoves(testDb, {
        collectionType: 'micronix_plate',
        moves: [
          { identifier: { type: 'id', id: plate.id }, targetLocationId: loc2.id },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.moved).toBe(1)
      expect(result.errors).toBeUndefined()
    })

    it('returns error when collection not found', async () => {
      const st = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(st.id),
        canContainCollections: true,
      })

      const result = await executeCollectionMoves(testDb, {
        collectionType: 'micronix_plate',
        moves: [
          { identifier: { type: 'id', id: 99999 }, targetLocationId: loc.id },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors![0].error).toMatch(/not found/)
    })

    it('all_or_nothing mode blocks all moves when any row is invalid', async () => {
      const st = await createTestStorageType(testDb, { name: 'Freezer' })
      const src = await createTestLocation(testDb, { name: 'Src', storageTypeId: String(st.id), canContainCollections: true })
      const dst = await createTestLocation(testDb, { name: 'Dst', storageTypeId: String(st.id), canContainCollections: true })
      const plateA = await createTestMicronixPlate(testDb, { name: 'PlateA', locationId: src.id })
      await createTestMicronixPlate(testDb, { name: 'PlateB', locationId: src.id })

      const result = await executeCollectionMoves(testDb, {
        collectionType: 'micronix_plate',
        atomicMode: 'all_or_nothing',
        moves: [
          { identifier: { type: 'id', id: plateA.id }, targetLocationId: dst.id },
          { identifier: { type: 'id', id: 999999 }, targetLocationId: dst.id },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      expect(result.errors?.length).toBeGreaterThan(0)
      const afterA = await testDb.select().from(micronixPlate).where(eq(micronixPlate.id, plateA.id)).get()
      expect(afterA?.locationId).toBe(src.id)
    })

    it('best_effort mode moves valid rows and reports invalid rows', async () => {
      const st = await createTestStorageType(testDb, { name: 'Freezer' })
      const src = await createTestLocation(testDb, { name: 'Src2', storageTypeId: String(st.id), canContainCollections: true })
      const dst = await createTestLocation(testDb, { name: 'Dst2', storageTypeId: String(st.id), canContainCollections: true })
      const plateA = await createTestMicronixPlate(testDb, { name: 'PlateC', locationId: src.id })

      const result = await executeCollectionMoves(testDb, {
        collectionType: 'micronix_plate',
        atomicMode: 'best_effort',
        moves: [
          { identifier: { type: 'id', id: plateA.id }, targetLocationId: dst.id },
          { identifier: { type: 'id', id: 999999 }, targetLocationId: dst.id },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(1)
      expect(result.errors?.length).toBeGreaterThan(0)
      const afterA = await testDb.select().from(micronixPlate).where(eq(micronixPlate.id, plateA.id)).get()
      expect(afterA?.locationId).toBe(dst.id)
    })
  })
})
