import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestStorageType,
  createTestMicronixPlate,
  createTestCryovialBox,
  createTestBox,
  createTestBag,
} from '../../__tests__/helpers/factories'
import { createTestUser } from '../../__tests__/helpers/auth-helpers'
import { resolveLocationByPath, executeCollectionMoves } from '../collection-move'
import type { Database } from '../../db/client'
import { micronixPlate, cryovialBox, box, bag } from '../../db/schema'
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

  describe('moves across Collection types in one request', () => {
    async function setup() {
      const st = await createTestStorageType(testDb, { name: 'Freezer' })
      const src = await createTestLocation(testDb, { name: 'Src', storageTypeId: String(st.id), canContainCollections: true })
      const dst = await createTestLocation(testDb, { name: 'Dst', storageTypeId: String(st.id), canContainCollections: true })
      const shelf = await createTestLocation(testDb, { name: 'Shelf', storageTypeId: String(st.id), canContainCollections: false })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: src.id })
      const cryoBox = await createTestCryovialBox(testDb, { name: 'CryoBox1', locationId: src.id })
      const paperBox = await createTestBox(testDb, { name: 'PaperBox1', locationId: src.id })
      const paperBag = await createTestBag(testDb, { name: 'Bag1', locationId: src.id })
      return { src, dst, shelf, plate, cryoBox, paperBox, paperBag }
    }

    function locationOf(table: typeof micronixPlate | typeof cryovialBox | typeof box | typeof bag, id: number) {
      return testDb.select({ locationId: table.locationId }).from(table).where(eq(table.id, id)).get()?.locationId
    }

    it('moves plates, cryovial boxes, boxes and bags together', async () => {
      const { src, dst, plate, cryoBox, paperBox, paperBag } = await setup()

      const result = await executeCollectionMoves(testDb, {
        moves: [
          { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
          { collectionType: 'cryovial_box', identifier: { type: 'id', id: cryoBox.id }, targetLocationId: dst.id },
          { collectionType: 'box', identifier: { type: 'id', id: paperBox.id }, targetLocationId: dst.id },
          { collectionType: 'bag', identifier: { type: 'id', id: paperBag.id }, targetLocationId: dst.id },
        ],
      })

      expect(result).toEqual({ success: true, moved: 4, errors: undefined })
      expect(locationOf(micronixPlate, plate.id)).toBe(dst.id)
      expect(locationOf(cryovialBox, cryoBox.id)).toBe(dst.id)
      expect(locationOf(box, paperBox.id)).toBe(dst.id)
      expect(locationOf(bag, paperBag.id)).toBe(dst.id)
      expect(src.id).not.toBe(dst.id)
    })

    it('all_or_nothing commits no plate when a box in the same request fails', async () => {
      const { src, dst, plate, cryoBox } = await setup()

      const result = await executeCollectionMoves(testDb, {
        atomicMode: 'all_or_nothing',
        moves: [
          { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
          { collectionType: 'cryovial_box', identifier: { type: 'id', id: cryoBox.id }, targetLocationId: src.id },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      expect(result.errors).toEqual([{ row: 2, error: expect.stringContaining('already at location') }])
      expect(locationOf(micronixPlate, plate.id)).toBe(src.id)
      expect(locationOf(cryovialBox, cryoBox.id)).toBe(src.id)
    })

    it('best_effort moves the valid types and reports the failing row by its place in the request', async () => {
      const { src, dst, plate, cryoBox, paperBox } = await setup()

      const result = await executeCollectionMoves(testDb, {
        atomicMode: 'best_effort',
        moves: [
          { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
          { collectionType: 'cryovial_box', identifier: { type: 'id', id: 999_999 }, targetLocationId: dst.id },
          { collectionType: 'box', identifier: { type: 'id', id: paperBox.id }, targetLocationId: dst.id },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(2)
      expect(result.errors).toEqual([{ row: 2, error: expect.stringContaining('ID 999999') }])
      expect(locationOf(micronixPlate, plate.id)).toBe(dst.id)
      expect(locationOf(box, paperBox.id)).toBe(dst.id)
      expect(locationOf(cryovialBox, cryoBox.id)).toBe(src.id)
    })

    it('uses the request collectionType for moves that do not name one', async () => {
      const { dst, plate, paperBox } = await setup()

      const result = await executeCollectionMoves(testDb, {
        collectionType: 'micronix_plate',
        moves: [
          { identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
          { collectionType: 'box', identifier: { type: 'id', id: paperBox.id }, targetLocationId: dst.id },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.moved).toBe(2)
    })

    it('rejects a move with no Collection type', async () => {
      const { dst, plate } = await setup()

      const result = await executeCollectionMoves(testDb, {
        moves: [{ identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id }],
      })

      expect(result).toEqual({ success: false, moved: 0, errors: [{ row: 1, error: 'collectionType is required' }] })
    })

    it('rejects the same Collection listed twice', async () => {
      const { src, dst, plate } = await setup()

      const result = await executeCollectionMoves(testDb, {
        moves: [
          { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
          { collectionType: 'micronix_plate', identifier: { type: 'name', name: 'Plate1' }, targetLocationId: dst.id },
        ],
      })

      expect(result.moved).toBe(0)
      expect(result.errors).toEqual([{ row: 2, error: expect.stringContaining('more than once') }])
      expect(locationOf(micronixPlate, plate.id)).toBe(src.id)
    })
  })

  describe('audit fields', () => {
    it('sets last_updated and updated_by on each moved Collection', async () => {
      const user = await createTestUser(testDb, { email: 'mover@test.com', name: 'Mover', password: 'password123' })
      const st = await createTestStorageType(testDb, { name: 'Freezer' })
      const src = await createTestLocation(testDb, { name: 'Src', storageTypeId: String(st.id), canContainCollections: true })
      const dst = await createTestLocation(testDb, { name: 'Dst', storageTypeId: String(st.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(testDb, { name: 'AuditPlate', locationId: src.id })
      const paperBag = await createTestBag(testDb, { name: 'AuditBag', locationId: src.id })
      const old = '2020-01-01T00:00:00.000Z'
      await testDb.update(micronixPlate).set({ lastUpdated: old }).where(eq(micronixPlate.id, plate.id))
      await testDb.update(bag).set({ lastUpdated: old }).where(eq(bag.id, paperBag.id))

      await executeCollectionMoves(
        testDb,
        {
          moves: [
            { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
            { collectionType: 'bag', identifier: { type: 'id', id: paperBag.id }, targetLocationId: dst.id },
          ],
        },
        { userId: user.id },
      )

      const afterPlate = testDb.select().from(micronixPlate).where(eq(micronixPlate.id, plate.id)).get()
      const afterBag = testDb.select().from(bag).where(eq(bag.id, paperBag.id)).get()
      expect(afterPlate?.updatedBy).toBe(user.id)
      expect(afterPlate?.lastUpdated).not.toBe(old)
      expect(afterBag?.updatedBy).toBe(user.id)
      expect(afterBag?.lastUpdated).not.toBe(old)
    })

    it('leaves a Collection whose move was skipped unchanged', async () => {
      const user = await createTestUser(testDb, { email: 'mover@test.com', name: 'Mover', password: 'password123' })
      const st = await createTestStorageType(testDb, { name: 'Freezer' })
      const src = await createTestLocation(testDb, { name: 'Src', storageTypeId: String(st.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(testDb, { name: 'StayPlate', locationId: src.id })
      const old = '2020-01-01T00:00:00.000Z'
      await testDb.update(micronixPlate).set({ lastUpdated: old }).where(eq(micronixPlate.id, plate.id))

      await executeCollectionMoves(
        testDb,
        {
          atomicMode: 'best_effort',
          moves: [{ collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: src.id }],
        },
        { userId: user.id },
      )

      const after = testDb.select().from(micronixPlate).where(eq(micronixPlate.id, plate.id)).get()
      expect(after?.updatedBy).toBeNull()
      expect(after?.lastUpdated).toBe(old)
    })
  })
  })
})
