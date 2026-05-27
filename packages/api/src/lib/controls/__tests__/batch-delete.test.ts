import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Database } from '../../../db/client'
import { controlBatch, specimen, storageContainer, micronixTube } from '../../../db/schema'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestControlBatch,
  createTestControlDefinition,
  createTestMicronixPlate,
  createTestLocation,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { NotFoundError } from '../../error-handler'
import { utcNow } from '../../datetime'
import { deleteBloodControlBatch, deleteSpecimenFromBatch } from '../batch-delete'

describe('batch-delete', () => {
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

  async function seedBloodBatchWithContainer() {
    const definition = await createTestControlDefinition(testDb, {
      name: 'Blood def',
      controlType: 'blood',
    })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch delete' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const unit = await createTestUnit(testDb, {
      symbol: `uL-del-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const container = await createTestStorageContainer(testDb, {
      specimenId: spec.id,
      unitId: unit.id,
    })
    const storageType = await createTestStorageType(testDb, { name: 'Lab' })
    const location = await createTestLocation(testDb, {
      name: 'Lab',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, {
      name: 'Plate',
      locationId: location.id,
    })
    const now = utcNow()
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'DEL-001',
      position: 'A01',
      created: now,
      lastUpdated: now,
    })
    return { batch, spec, container }
  }

  it('deleteBloodControlBatch removes batch, specimens, and containers', async () => {
    const { batch, spec, container } = await seedBloodBatchWithContainer()

    await deleteBloodControlBatch(testDb, batch.id)

    expect(await testDb.select().from(controlBatch).where(eq(controlBatch.id, batch.id)).get()).toBeUndefined()
    expect(await testDb.select().from(specimen).where(eq(specimen.id, spec.id)).get()).toBeUndefined()
    expect(
      await testDb.select().from(storageContainer).where(eq(storageContainer.id, container.id)).get()
    ).toBeUndefined()
    expect(await testDb.select().from(micronixTube).where(eq(micronixTube.id, container.id)).get()).toBeUndefined()
  })

  it('deleteBloodControlBatch throws NotFoundError for missing batch', async () => {
    await expect(deleteBloodControlBatch(testDb, 99999)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deleteBloodControlBatch throws NotFoundError for non-blood batch', async () => {
    const definition = await createTestControlDefinition(testDb, {
      name: 'Plasma def',
      controlType: 'plasma_positive',
    })
    const batch = await createTestControlBatch(testDb, definition.id)

    await expect(deleteBloodControlBatch(testDb, batch.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deleteSpecimenFromBatch removes one specimen and leaves the batch', async () => {
    const definition = await createTestControlDefinition(testDb, { controlType: 'blood' })
    const batch = await createTestControlBatch(testDb, definition.id)
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control' })
    const keep = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const remove = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })

    await deleteSpecimenFromBatch(testDb, batch.id, remove.id)

    expect(await testDb.select().from(specimen).where(eq(specimen.id, remove.id)).get()).toBeUndefined()
    expect(await testDb.select().from(specimen).where(eq(specimen.id, keep.id)).get()).toBeDefined()
    expect(await testDb.select().from(controlBatch).where(eq(controlBatch.id, batch.id)).get()).toBeDefined()
  })
})
