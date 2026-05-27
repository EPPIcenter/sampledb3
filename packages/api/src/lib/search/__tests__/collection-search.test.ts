import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestStorageType,
} from '../../../__tests__/helpers/factories'
import { searchCollections } from '../collection-search'

describe('collection-search', () => {
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

  it('finds micronix plates by name', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Plate Storage' })
    const loc = await createTestLocation(testDb, {
      name: 'Plate Freezer',
      path: 'Plate Freezer',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, {
      name: 'Unique Plate Name',
      locationId: loc.id,
      barcode: 'PLATE-XYZ',
    })

    const results = await searchCollections(testDb, 'Unique Plate')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'micronix_plate',
      id: plate.id,
      title: 'Unique Plate Name',
      url: `/collections/micronix-plates/${plate.id}`,
    })
  })
})
