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
  createTestStorageContainer,
  createTestStorageType,
  createTestStrain,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { NotFoundError } from '../../error-handler'
import { utcNow } from '../../datetime'
import { micronixTube, storageContainer } from '../../../db/schema'
import { getBloodControlBatchSummary } from '../batch-summary'

describe('batch-summary', () => {
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

  it('getBloodControlBatchSummary returns empty specimens for batch with no specimens', async () => {
    const definition = await createTestControlDefinition(testDb, { controlType: 'blood' })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Empty batch' })

    const result = await getBloodControlBatchSummary(testDb, batch.id)

    expect(result.batch.name).toBe('Empty batch')
    expect(result.specimens).toEqual([])
    expect(result.summary.totalSpecimens).toBe(0)
  })

  it('getBloodControlBatchSummary enriches specimens with containers', async () => {
    const strain = await createTestStrain(testDb, { name: 'Summary strain' })
    const definition = await createTestControlDefinition(testDb, {
      controlType: 'blood',
      properties: {
        strains: [{ id: strain.id, percentage: 100 }],
        targetDensity: 1000,
      },
    })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch summary' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const unit = await createTestUnit(testDb, {
      symbol: `uL-sum-${Date.now()}`,
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
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate', locationId: location.id })
    const now = utcNow()
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'SUM-01',
      position: 'A01',
      created: now,
      lastUpdated: now,
    })

    const result = await getBloodControlBatchSummary(testDb, batch.id)

    expect(result.specimens).toHaveLength(1)
    expect(result.summary.totalSpecimens).toBe(1)
    expect(result.batch.definition?.name).toBe(definition.name)
  })

  it('throws NotFoundError for missing batch', async () => {
    await expect(getBloodControlBatchSummary(testDb, 99999)).rejects.toBeInstanceOf(NotFoundError)
  })
})
