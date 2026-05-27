import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestStorageContainer,
} from '../../__tests__/helpers/factories'
import { collectContainerPlacementErrors } from '../container-placement-validation'
import { micronixTube } from '../../db/schema'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'

describe('container-placement-validation', () => {
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

  describe('collectContainerPlacementErrors', () => {
    it('detects duplicate positions within the same collection in payload', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: loc.id })
      const collectionKey = `micronix_plate-${plate.name}`

      const errors = await collectContainerPlacementErrors(testDb, [
        {
          containerType: 'micronix_tube',
          collectionId: plate.id,
          collectionKey,
          normalizedPosition: 'A01',
          barcode: 'BC1',
        },
        {
          containerType: 'micronix_tube',
          collectionId: plate.id,
          collectionKey,
          normalizedPosition: 'A01',
          barcode: 'BC2',
        },
      ])

      expect(errors.some((e) => e.message.includes('used more than once in your file'))).toBe(true)
    })

    it('detects position already used in database', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: loc.id })
      const now = utcNow()
      const container = await createTestStorageContainer(testDb)
      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: 'TAKEN',
        position: 'A01',
        created: now,
        lastUpdated: now,
      })

      const errors = await collectContainerPlacementErrors(testDb, [
        {
          containerType: 'micronix_tube',
          collectionId: plate.id,
          collectionKey: `micronix_plate-${plate.name}`,
          normalizedPosition: 'A01',
          barcode: 'NEW1',
        },
      ])

      expect(errors.some((e) => e.message.includes('already used in this plate'))).toBe(true)
    })
  })
})
