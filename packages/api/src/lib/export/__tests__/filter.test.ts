import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageType,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { filterContainerIdsByType } from '../filter'
import { micronixTube, storageContainer } from '../../../db/schema'
import { utcNow } from '../../datetime'

describe('filterContainerIdsByType', () => {
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

  it('returns all container ids when no filter', async () => {
    const ids = [1, 2, 3]
    const result = await filterContainerIdsByType(testDb, ids)
    expect(result).toEqual(ids)
  })

  it('returns all container ids when empty filter array', async () => {
    const ids = [1, 2]
    const result = await filterContainerIdsByType(testDb, ids, [])
    expect(result).toEqual(ids)
  })

  it('returns empty array when filter specified but no matching containers', async () => {
    const ids: number[] = []
    const result = await filterContainerIdsByType(testDb, ids, ['micronix_tube'])
    expect(result).toEqual([])
  })

  it('filters to micronix tubes via placement reads', async () => {
    const unit = await createTestUnit(testDb, {
      symbol: `uL-filter-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const now = utcNow()
    const [container] = await testDb
      .insert(storageContainer)
      .values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1,
        remainingQuantity: 1,
        created: now,
        lastUpdated: now,
      })
      .returning()

    const storageType = await createTestStorageType(testDb, { name: `Lab-${container!.id}` })
    const location = await createTestLocation(testDb, {
      name: `Lab-${container!.id}`,
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, {
      name: `Plate-${container!.id}`,
      locationId: location.id,
    })
    await testDb.insert(micronixTube).values({
      id: container!.id,
      collectionId: plate.id,
      barcode: `MX-${container!.id}`,
      position: 'A01',
    })

    const result = await filterContainerIdsByType(testDb, [container!.id, 99999], ['micronix_tube'])
    expect(result).toEqual([container!.id])
  })
})
