import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
} from '../../../__tests__/helpers/factories'
import { micronixTube } from '../../../db/schema'
import { searchContainers } from '../container-search'

describe('container-search', () => {
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

  it('finds micronix containers by barcode', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Search Storage' })
    const loc = await createTestLocation(testDb, {
      name: 'Search Freezer',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, {
      name: 'Search Plate',
      locationId: loc.id,
      barcode: 'PLATE-001',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Search Type' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const container = await createTestStorageContainer(testDb, { specimenId: specimen.id })
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-SEARCH-42',
      position: 'C03',
    })

    const results = await searchContainers(testDb, 'MX-SEARCH')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'container',
      id: container.id,
      title: 'Micronix Tube: MX-SEARCH-42',
      url: `/containers/${container.id}`,
    })
  })
})
