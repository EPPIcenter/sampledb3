import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import type { Database } from '../../../db/client'
import { SQL_IN_CHUNK_SIZE } from '../../sql-helpers'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestMicronixTube,
  createTestStorageContainer,
  createTestStorageType,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { resolveMicronixBarcodesToContainers } from '../query'

describe('resolveMicronixBarcodesToContainers', () => {
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

  it('returns empty map for empty barcodes', async () => {
    const result = await resolveMicronixBarcodesToContainers(testDb, [])
    expect(result.size).toBe(0)
  })

  it('returns empty map for non-existent barcodes', async () => {
    const result = await resolveMicronixBarcodesToContainers(testDb, ['BAR1', 'BAR2'])
    expect(result.size).toBe(0)
  })

  it('filters out blank barcodes', async () => {
    const result = await resolveMicronixBarcodesToContainers(testDb, ['  ', ''])
    expect(result.size).toBe(0)
  })

  it('resolves every listed barcode when the list has more barcodes than SQLite allows as bound parameters', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer -80' })
    const freezer = await createTestLocation(testDb, {
      name: 'Freezer',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate', locationId: freezer.id })
    const unitId = (await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })).id as number
    const specimenId = (await createTestStorageContainer(testDb, { unitId })).specimenId
    const first = await createTestStorageContainer(testDb, { unitId, specimenId })
    await createTestMicronixTube(testDb, { containerId: first.id, collectionId: plate.id, barcode: 'FIRST' })
    const last = await createTestStorageContainer(testDb, { unitId, specimenId })
    await createTestMicronixTube(testDb, { containerId: last.id, collectionId: plate.id, barcode: 'LAST' })
    const unknown = Array.from({ length: SQL_IN_CHUNK_SIZE * 140 }, (_, i) => `UNKNOWN${i}`)

    const result = await resolveMicronixBarcodesToContainers(testDb, ['FIRST', ...unknown, 'LAST'])

    expect(result).toEqual(new Map([['FIRST', first.id], ['LAST', last.id]]))
  })
})
