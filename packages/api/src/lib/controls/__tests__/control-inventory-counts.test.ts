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
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import {
  buildControlInventoryCountSubqueries,
  controlInventoryCountSelectFields,
  type BuildControlInventoryCountSubqueriesOptions,
} from '../control-inventory-counts'
import { controlBatch, controlDefinition, micronixTube, storageContainer } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { utcNow } from '../../datetime'

describe('buildControlInventoryCountSubqueries', () => {
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

  async function queryBatchCounts(
    batchId: number,
    options: BuildControlInventoryCountSubqueriesOptions,
  ) {
    const subqueries = buildControlInventoryCountSubqueries(testDb, options)
    const fields = controlInventoryCountSelectFields(subqueries)

    return testDb
      .select(fields)
      .from(controlBatch)
      .leftJoin(subqueries.specimenCounts, eq(controlBatch.id, subqueries.specimenCounts.batchId))
      .leftJoin(subqueries.spotCounts, eq(controlBatch.id, subqueries.spotCounts.batchId))
      .leftJoin(subqueries.micronixCounts, eq(controlBatch.id, subqueries.micronixCounts.batchId))
      .leftJoin(subqueries.cryovialCounts, eq(controlBatch.id, subqueries.cryovialCounts.batchId))
      .leftJoin(subqueries.staticWellCounts, eq(controlBatch.id, subqueries.staticWellCounts.batchId))
      .leftJoin(subqueries.tubeCounts, eq(controlBatch.id, subqueries.tubeCounts.batchId))
      .where(eq(controlBatch.id, batchId))
      .get()
  }

  async function queryDefinitionCounts(
    definitionId: number,
    options: BuildControlInventoryCountSubqueriesOptions,
  ) {
    const subqueries = buildControlInventoryCountSubqueries(testDb, options)
    const fields = controlInventoryCountSelectFields(subqueries)

    return testDb
      .select(fields)
      .from(controlDefinition)
      .leftJoin(
        subqueries.specimenCounts,
        eq(controlDefinition.id, subqueries.specimenCounts.definitionId),
      )
      .leftJoin(subqueries.spotCounts, eq(controlDefinition.id, subqueries.spotCounts.definitionId))
      .leftJoin(subqueries.micronixCounts, eq(controlDefinition.id, subqueries.micronixCounts.definitionId))
      .leftJoin(subqueries.cryovialCounts, eq(controlDefinition.id, subqueries.cryovialCounts.definitionId))
      .leftJoin(
        subqueries.staticWellCounts,
        eq(controlDefinition.id, subqueries.staticWellCounts.definitionId),
      )
      .leftJoin(subqueries.tubeCounts, eq(controlDefinition.id, subqueries.tubeCounts.definitionId))
      .where(eq(controlDefinition.id, definitionId))
      .get()
  }

  it('counts all micronix tubes when countScope is all', async () => {
    const unit = await createTestUnit(testDb, {
      symbol: `uL-all-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const definition = await createTestControlDefinition(testDb, { name: 'Def All' })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch All' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control specimen' })
    const inStockSpecimen = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const depletedSpecimen = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })

    await createMicronixContainer(inStockSpecimen.id, 1, unit.id)
    await createMicronixContainer(depletedSpecimen.id, 0, unit.id)

    const counts = await queryBatchCounts(batch.id, { groupBy: 'batch', countScope: 'all' })

    expect(counts).toMatchObject({
      specimenCount: 2,
      micronixCount: 2,
      tubeCount: 2,
      inventoryTotal: 2,
    })
  })

  it('counts only in-stock micronix tubes when countScope is in_stock', async () => {
    const unit = await createTestUnit(testDb, {
      symbol: `uL-stock-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const definition = await createTestControlDefinition(testDb, { name: 'Def Stock' })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch Stock' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control specimen' })
    const inStockSpecimen = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const depletedSpecimen = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })

    await createMicronixContainer(inStockSpecimen.id, 1, unit.id)
    await createMicronixContainer(depletedSpecimen.id, 0, unit.id)

    const counts = await queryBatchCounts(batch.id, { groupBy: 'batch', countScope: 'in_stock' })

    expect(counts).toMatchObject({
      specimenCount: 2,
      micronixCount: 1,
      tubeCount: 1,
      inventoryTotal: 1,
    })
  })

  it('aggregates definition-level counts across batches', async () => {
    const unit = await createTestUnit(testDb, {
      symbol: `uL-agg-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const definition = await createTestControlDefinition(testDb, { name: 'Def Agg' })
    const batchA = await createTestControlBatch(testDb, definition.id, { name: 'Batch A' })
    const batchB = await createTestControlBatch(testDb, definition.id, { name: 'Batch B' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control specimen' })

    const specimenA = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batchA.id })
    const specimenB = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batchB.id })

    await createMicronixContainer(specimenA.id, 1, unit.id)
    await createMicronixContainer(specimenB.id, 0, unit.id)

    const counts = await queryDefinitionCounts(definition.id, {
      groupBy: 'definition',
      countScope: 'in_stock',
    })

    expect(counts).toMatchObject({
      specimenCount: 2,
      micronixCount: 1,
      tubeCount: 1,
    })
  })
})
