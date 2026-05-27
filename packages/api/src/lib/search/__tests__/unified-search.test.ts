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
  createTestStudy,
  createTestStudySubject,
} from '../../../__tests__/helpers/factories'
import { micronixTube } from '../../../db/schema'
import { searchUnified } from '../unified-search'
import { resolveSearchTypes } from '../types'

describe('search types', () => {
  it('maps collection entity types to collection search bucket', () => {
    expect(resolveSearchTypes('micronix_plate')).toEqual(['collection'])
    expect(resolveSearchTypes(undefined)).toEqual(['specimen', 'container', 'study', 'subject'])
  })
})

describe('unified-search', () => {
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

  it('returns empty results for blank queries via caller', async () => {
    const result = await searchUnified(testDb, '', undefined)
    expect(result).toEqual({ results: [], query: '', count: 0 })
  })

  it('finds studies by short code', async () => {
    await createTestStudy(testDb, { title: 'Alpha Study', shortCode: 'ALPHA' })

    const result = await searchUnified(testDb, 'ALPHA', 'study')

    expect(result.count).toBe(1)
    expect(result.results[0]).toMatchObject({
      type: 'study',
      title: 'Alpha Study',
      subtitle: 'Code: ALPHA',
      url: expect.stringMatching(/^\/studies\/\d+$/),
    })
  })

  it('finds micronix containers by barcode', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Search Storage' })
    const loc = await createTestLocation(testDb, {
      name: 'Search Freezer',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, {
      name: 'Search Plate',
      locationId: loc.id,
      barcode: 'PLATE-001',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Search Type' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const container = await createTestStorageContainer(testDb, { specimenId: specimen.id })
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-SEARCH-42',
      position: 'C03',
    })

    const result = await searchUnified(testDb, 'MX-SEARCH', 'container')

    expect(result.count).toBe(1)
    expect(result.results[0]).toMatchObject({
      type: 'container',
      id: container.id,
      title: 'Micronix Tube: MX-SEARCH-42',
      url: `/containers/${container.id}`,
    })
  })
})
