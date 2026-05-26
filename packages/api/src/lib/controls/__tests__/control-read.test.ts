import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestControlBatch,
  createTestControlDefinition,
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageType,
  createTestStrain,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { NotFoundError } from '../../error-handler'
import { utcNow } from '../../datetime'
import {
  getBloodControlBatch,
  getBloodControlDefinition,
  listBatchesForBloodControlDefinition,
  listBloodControlBatches,
  listBloodControlDefinitions,
} from '../control-read'
import { micronixTube, storageContainer } from '../../../db/schema'

describe('control-read', () => {
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

  async function createMicronixContainer(
    specimenId: number,
    remainingQuantity: number,
    unitId: number,
  ) {
    const now = utcNow()
    const [container] = await testDb
      .insert(storageContainer)
      .values({
        specimenId,
        unitId,
        totalQuantity: 1,
        remainingQuantity,
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

    return container!
  }

  it('listBloodControlBatches returns inventory counts with countScope all', async () => {
    const strain = await createTestStrain(testDb, { name: 'Strain A' })
    const definition = await createTestControlDefinition(testDb, {
      name: 'Def List',
      properties: {
        strains: [{ id: strain.id, name: 'Strain A', percentage: 100 }],
        targetDensity: 1000,
      },
    })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch List' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control specimen' })
    const inStockSpecimen = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const depletedSpecimen = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const unit = await createTestUnit(testDb, {
      symbol: `uL-list-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })

    await createMicronixContainer(inStockSpecimen.id, 1, unit.id)
    await createMicronixContainer(depletedSpecimen.id, 0, unit.id)

    const { batches } = await listBloodControlBatches(testDb)
    const listed = batches.find((b) => b.id === batch.id)

    expect(listed).toMatchObject({
      name: 'Batch List',
      definitionName: 'Def List',
      specimenCount: 2,
      micronixCount: 2,
      tubeCount: 2,
    })
  })

  it('listBloodControlDefinitions parses strains and aggregates counts', async () => {
    const strain = await createTestStrain(testDb, { name: 'Strain B' })
    const definition = await createTestControlDefinition(testDb, {
      name: 'Def Controls',
      properties: {
        strains: [{ id: strain.id, percentage: 100 }],
        targetDensity: 500,
      },
    })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch 1' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control specimen' })
    const specimen = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const unit = await createTestUnit(testDb, {
      symbol: `uL-def-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    await createMicronixContainer(specimen.id, 1, unit.id)

    const { controls } = await listBloodControlDefinitions(testDb)
    const listed = controls.find((c) => c.id === definition.id)

    expect(listed).toMatchObject({
      name: 'Def Controls',
      batchCount: 1,
      specimenCount: 1,
      micronixCount: 1,
      targetDensity: 500,
    })
    expect(listed?.strains[0]).toMatchObject({ id: strain.id, percentage: 100 })
  })

  it('getBloodControlBatch throws NotFoundError for missing batch', async () => {
    await expect(getBloodControlBatch(testDb, 99999)).rejects.toThrow(NotFoundError)
  })

  it('getBloodControlDefinition throws NotFoundError for missing definition', async () => {
    await expect(getBloodControlDefinition(testDb, 99999)).rejects.toThrow(NotFoundError)
  })

  it('listBatchesForBloodControlDefinition throws NotFoundError for missing definition', async () => {
    await expect(listBatchesForBloodControlDefinition(testDb, 99999)).rejects.toThrow(NotFoundError)
  })

  it('listBatchesForBloodControlDefinition returns batches ordered by production date', async () => {
    const definition = await createTestControlDefinition(testDb, { name: 'Def Batches' })
    const older = await createTestControlBatch(testDb, definition.id, {
      name: 'Older',
      productionDate: '2024-01-01',
    })
    const newer = await createTestControlBatch(testDb, definition.id, {
      name: 'Newer',
      productionDate: '2025-01-01',
    })

    const { batches } = await listBatchesForBloodControlDefinition(testDb, definition.id)

    expect(batches.map((b) => b.id)).toEqual([newer.id, older.id])
  })
})
