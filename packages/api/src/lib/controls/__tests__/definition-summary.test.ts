import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Database } from '../../../db/client'
import { controlBatch, specimen } from '../../../db/schema'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestControlBatch,
  createTestControlDefinition,
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestStrain,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { NotFoundError } from '../../error-handler'
import { utcNow } from '../../datetime'
import { micronixTube, storageContainer } from '../../../db/schema'
import { getBloodControlDefinitionSummary } from '../definition-summary'

describe('definition-summary', () => {
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

  async function seedDefinitionWithBatch() {
    const strain = await createTestStrain(testDb, { name: 'Summary strain' })
    const definition = await createTestControlDefinition(testDb, {
      name: 'Def summary',
      controlType: 'blood',
      properties: {
        strains: [{ id: strain.id, name: strain.name, percentage: 100 }],
        targetDensity: 1000,
      },
    })
    const batch = await createTestControlBatch(testDb, definition.id, {
      name: 'Batch 1',
      productionDate: '2024-06-01',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const unit = await createTestUnit(testDb, {
      symbol: `uL-defsum-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const container = await createTestStorageContainer(testDb, {
      specimenId: spec.id,
      unitId: unit.id,
      remainingQuantity: 1,
    })
    const storageType = await createTestStorageType(testDb, { name: 'Lab' })
    const location = await createTestLocation(testDb, {
      name: 'Lab',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate', locationId: location.id })
    const now = utcNow()
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'DS-01',
      position: 'A01',
      created: now,
      lastUpdated: now,
    })
    return { definition, batch, spec }
  }

  it('getBloodControlDefinitionSummary returns batches, composition, and stats', async () => {
    const { definition, batch } = await seedDefinitionWithBatch()

    const result = await getBloodControlDefinitionSummary(testDb, definition.id)

    expect(result.control.name).toBe('Def summary')
    expect(result.composition?.strains).toHaveLength(1)
    expect(result.batches).toHaveLength(1)
    expect(result.batches[0]?.id).toBe(batch.id)
    expect(result.stats.totalBatches).toBe(1)
    expect(result.stats.totalSpecimens).toBe(1)
    expect(result.stats.inStockBatchesCount).toBeGreaterThanOrEqual(0)
  })

  it('throws NotFoundError for non-blood or missing definition', async () => {
    const plasma = await createTestControlDefinition(testDb, {
      controlType: 'plasma_positive',
      name: 'Plasma',
    })
    await expect(getBloodControlDefinitionSummary(testDb, plasma.id)).rejects.toBeInstanceOf(
      NotFoundError
    )
    await expect(getBloodControlDefinitionSummary(testDb, 99999)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns zeroed stats when definition has no batches', async () => {
    const definition = await createTestControlDefinition(testDb, {
      name: 'Empty def',
      controlType: 'blood',
      properties: { strains: [], targetDensity: 100 },
    })

    const result = await getBloodControlDefinitionSummary(testDb, definition.id)

    expect(result.batches).toHaveLength(0)
    expect(result.stats.totalBatches).toBe(0)
    expect(result.stats.totalSpecimens).toBe(0)
    expect(await testDb.select().from(controlBatch).where(eq(controlBatch.controlDefinitionId, definition.id))).toHaveLength(0)
    expect(
      await testDb.select().from(specimen).where(eq(specimen.controlBatchId, definition.id))
    ).toHaveLength(0)
  })
})
