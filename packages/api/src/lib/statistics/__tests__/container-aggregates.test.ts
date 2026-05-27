import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { storageContainer } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { resolveContainerTypes } from '../../container-placement'
import { computeContainerAggregates } from '../container-aggregates'

describe('container-aggregates', () => {
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

  it('derives status breakdown from remaining quantity', async () => {
    const specimenType = await createTestSpecimenType(testDb, { name: `Type-${Date.now()}` })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const unit = await createTestUnit(testDb, {
      symbol: `uL-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const shared = { specimenId: specimen.id, unitId: unit.id as number }
    const inUse = await createTestStorageContainer(testDb, shared)
    const exhausted = await createTestStorageContainer(testDb, shared)
    await testDb
      .update(storageContainer)
      .set({ remainingQuantity: 0 })
      .where(eq(storageContainer.id, exhausted.id))

    const containers = [
      { ...inUse, remainingQuantity: 1 },
      { ...exhausted, remainingQuantity: 0 },
    ]
    const typeMap = await resolveContainerTypes(
      testDb,
      containers.map((c) => c.id),
    )

    const result = await computeContainerAggregates(testDb, containers, typeMap)

    expect(result.byStatus['In Use']).toBe(1)
    expect(result.byStatus.Exhausted).toBe(1)
  })
})
