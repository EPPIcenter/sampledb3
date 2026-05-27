import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestStorageContainer,
  createTestStorageType,
} from '../../../__tests__/helpers/factories'
import { micronixTube } from '../../../db/schema'
import {
  resolveContainerIdsAtLocations,
  resolveStatisticsLocationFilter,
} from '../location-filter'

describe('location-filter', () => {
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

  it('resolveStatisticsLocationFilter returns none without location_id', async () => {
    const result = await resolveStatisticsLocationFilter(
      testDb,
      sqlite as SQLiteDatabase,
      undefined,
    )
    expect(result).toEqual({ kind: 'none' })
  })

  it('resolveStatisticsLocationFilter returns not_found for missing location', async () => {
    const result = await resolveStatisticsLocationFilter(
      testDb,
      sqlite as SQLiteDatabase,
      '99999',
    )
    expect(result).toEqual({ kind: 'not_found' })
  })

  it('resolveStatisticsLocationFilter returns resolved ids for an existing location', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Freezer A',
      storageTypeId: String(storageType.id),
    })

    const result = await resolveStatisticsLocationFilter(
      testDb,
      sqlite as SQLiteDatabase,
      String(loc.id),
    )

    expect(result).toEqual({
      kind: 'resolved',
      filteredLocationIds: [loc.id],
    })
  })

  it('resolveContainerIdsAtLocations returns micronix container ids at matching locations', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Shelf Storage' })
    const loc = await createTestLocation(testDb, {
      name: 'Shelf 1',
      storageTypeId: String(storageType.id),
    })
    const otherStorageType = await createTestStorageType(testDb, { name: 'Other Storage' })
    const otherLoc = await createTestLocation(testDb, {
      name: 'Shelf 2',
      storageTypeId: String(otherStorageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate 1', locationId: loc.id })
    await createTestMicronixPlate(testDb, { name: 'Plate 2', locationId: otherLoc.id })

    const container = await createTestStorageContainer(testDb)
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-LOC-1',
      position: 'A01',
    })

    const ids = await resolveContainerIdsAtLocations(testDb, [loc.id])

    expect(ids).toEqual([container.id])
  })
})
