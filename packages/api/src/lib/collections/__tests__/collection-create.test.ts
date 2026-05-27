import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Database } from '../../../db/client'
import { micronixPlate } from '../../../db/schema'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { createTestLocation, createTestStorageType } from '../../../__tests__/helpers/factories'
import {
  createMicronixPlate,
  CollectionLocationNotFoundError,
  CollectionLocationNotAllowedError,
  CollectionNameExistsError,
} from '../collection-create'

describe('collection-create', () => {
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

  async function collectionLocation() {
    const storageType = await createTestStorageType(testDb, { name: `ST-${Date.now()}` })
    return createTestLocation(testDb, {
      name: 'Collection room',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
  }

  it('createMicronixPlate inserts plate with location path', async () => {
    const loc = await collectionLocation()
    const result = await createMicronixPlate(testDb, {
      name: 'Plate-New',
      locationId: loc.id,
      barcode: 'PLT-NEW',
    })

    expect(result.plate.name).toBe('Plate-New')
    expect(result.plate.locationPath).toContain('Collection room')
    const row = await testDb.select().from(micronixPlate).where(eq(micronixPlate.name, 'Plate-New')).get()
    expect(row?.barcode).toBe('PLT-NEW')
  })

  it('throws CollectionLocationNotFoundError for missing location', async () => {
    await expect(
      createMicronixPlate(testDb, { name: 'X', locationId: 99999 })
    ).rejects.toBeInstanceOf(CollectionLocationNotFoundError)
  })

  it('throws CollectionLocationNotAllowedError when location cannot hold collections', async () => {
    const storageType = await createTestStorageType(testDb, { name: `Inner-${Date.now()}` })
    const loc = await createTestLocation(testDb, {
      name: 'Inner shelf',
      storageTypeId: String(storageType.id),
      canContainCollections: false,
    })

    await expect(
      createMicronixPlate(testDb, { name: 'Bad', locationId: loc.id })
    ).rejects.toBeInstanceOf(CollectionLocationNotAllowedError)
  })

  it('throws CollectionNameExistsError for duplicate plate name', async () => {
    const loc = await collectionLocation()
    await createMicronixPlate(testDb, { name: 'Dup-Plate', locationId: loc.id })

    await expect(
      createMicronixPlate(testDb, { name: 'Dup-Plate', locationId: loc.id })
    ).rejects.toBeInstanceOf(CollectionNameExistsError)
  })
})
