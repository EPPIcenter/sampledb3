import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestStorageContainer,
  createTestStorageType,
} from '../../../__tests__/helpers/factories'
import { micronixTube } from '../../../db/schema'
import { computeStorageStatistics } from '../storage-aggregates'

describe('storage-aggregates', () => {
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

  it('returns empty storage stats when no containers are provided', async () => {
    const result = await computeStorageStatistics(testDb, [], 0)

    expect(result.byLocation).toEqual([])
    expect(result.byRootLocation).toEqual({})
    expect(result._summary).toEqual({
      totalContainers: 0,
      containersWithLocations: 0,
      containersWithoutLocations: 0,
    })
  })

  it('counts containers by root location for micronix tubes on a plate', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Root Storage' })
    const loc = await createTestLocation(testDb, {
      name: 'Root Freezer',
      path: 'Root Freezer',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate A', locationId: loc.id })
    const container = await createTestStorageContainer(testDb)
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-STORAGE-1',
      position: 'A01',
    })

    const result = await computeStorageStatistics(testDb, [container.id], 1)

    expect(result.byRootLocation['Root Freezer']).toBe(1)
    expect(result._summary).toEqual({
      totalContainers: 1,
      containersWithLocations: 1,
      containersWithoutLocations: 0,
    })
  })
})
