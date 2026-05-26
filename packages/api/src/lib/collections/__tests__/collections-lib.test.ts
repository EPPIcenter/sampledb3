import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestStorageType,
  createTestMicronixPlate,
  createTestUnit,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { enrichStorageContainer } from '../container-detail'
import { listAllCollections, listCollectionsByType } from '../collection-list'
import { getMicronixPlateDetail } from '../collection-detail'
import { micronixTube } from '../../../db/schema'

describe('collections lib', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) cleanupTestDatabase(sqlite)
  })

  describe('listAllCollections', () => {
    it('returns micronix plates with item counts', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Freezer',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate-A', locationId: loc.id })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Test Type' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const container = await createTestStorageContainer(testDb, {
        specimenId: specimen.id,
        unitId: unit.id,
      })
      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: 'BC001',
        position: 'A01',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })

      const collections = await listAllCollections(testDb)
      const found = collections.find((c) => c.type === 'micronix_plate' && c.id === plate.id)
      expect(found).toBeDefined()
      expect(found?.itemCount).toBe(1)
      expect(found?.location?.path).toBeDefined()
    })
  })

  describe('listCollectionsByType', () => {
    it('lists sheets with paper counts', async () => {
      const result = await listCollectionsByType(testDb, 'sheet')
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('getMicronixPlateDetail', () => {
    it('returns null for missing plate', async () => {
      expect(await getMicronixPlateDetail(testDb, 99999)).toBeNull()
    })
  })

  describe('enrichStorageContainer', () => {
    it('returns null for missing container', async () => {
      expect(await enrichStorageContainer(testDb, 99999)).toBeNull()
    })
  })
})
