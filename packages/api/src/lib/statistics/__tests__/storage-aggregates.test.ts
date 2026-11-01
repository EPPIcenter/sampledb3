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
  createTestUnit,
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

  describe('locations in use (#107)', () => {
    let storageTypeId: string
    let unitId: number
    let specimenTypeId: number

    beforeEach(async () => {
      storageTypeId = String((await createTestStorageType(testDb, { name: 'Freezer' })).id)
      unitId = (await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })).id
      specimenTypeId = (await createTestSpecimenType(testDb, { name: 'Blood' })).id
    })

    /** A micronix tube on its own plate at a new Location with this path. */
    async function tubeAtNewLocation(path: string, index: number): Promise<number> {
      const loc = await createTestLocation(testDb, { name: `${path} ${index}`, path, storageTypeId })
      const plate = await createTestMicronixPlate(testDb, { name: `Plate ${index}`, locationId: loc.id })
      const spec = await createTestSpecimen(testDb, specimenTypeId)
      const container = await createTestStorageContainer(testDb, { specimenId: spec.id, unitId })
      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: `MX-LOC-${index}`,
        position: 'A01',
      })
      return container.id
    }

    it('lists every Location holding Containers, not a top-20 list', async () => {
      const containerIds: number[] = []
      for (let i = 0; i < 25; i++) containerIds.push(await tubeAtNewLocation(`Shelf ${i}`, i))

      const result = await computeStorageStatistics(testDb, containerIds, containerIds.length)

      expect(result.byLocation).toHaveLength(25)
    })

    it('counts two Locations that share a path as two Locations', async () => {
      const containerIds = [await tubeAtNewLocation('Shelf', 1), await tubeAtNewLocation('Shelf', 2)]

      const result = await computeStorageStatistics(testDb, containerIds, containerIds.length)

      expect(result.byLocation).toEqual([
        { location: 'Shelf', count: 1 },
        { location: 'Shelf', count: 1 },
      ])
    })
  })
})
