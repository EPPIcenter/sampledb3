import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestStorageType,
  createTestMicronixPlate,
  createTestUnit,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { enrichStorageContainer, enrichStorageContainers } from '../container-detail'
import { listAllCollections, listCollectionsByType } from '../collection-list'
import { getMicronixPlateDetail } from '../collection-detail'
import { micronixTube } from '../../../db/schema'

describe('collections lib', () => {
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

  describe('listAllCollections', () => {
    it('returns micronix plates with item counts', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Freezer',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate-A', locationId: loc.id })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Test Type' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const container = await createTestStorageContainer(testDb, {
        specimenId: specimen.id,
        unitId: unit.id,
      })
      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: 'BC001',
        position: 'A01',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })

      const collections = await listAllCollections(testDb)
      const found = collections.find((c) => c.type === 'micronix_plate' && c.id === plate.id)
      expect(found).toBeDefined()
      expect(found?.itemCount).toBe(1)
      expect(found?.location?.path).toBeDefined()
    })
  })

  describe('listCollectionsByType', () => {
    it('lists sheets with paper counts', async () => {
      const result = await listCollectionsByType(testDb, 'sheet')
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('getMicronixPlateDetail', () => {
    it('returns null for missing plate', async () => {
      expect(await getMicronixPlateDetail(testDb, 99999)).toBeNull()
    })

    it('returns plate with tube entries and location path', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Detail freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Detail freezer',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Detail-Plate', locationId: loc.id })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Type' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const container = await createTestStorageContainer(testDb, {
        specimenId: specimen.id,
        unitId: unit.id,
      })
      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: 'DT-01',
        position: 'B02',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })

      const detail = await getMicronixPlateDetail(testDb, plate.id)
      expect(detail?.plate.name).toBe('Detail-Plate')
      expect(detail?.plate.locationPath).toBeDefined()
      expect(Object.keys(detail?.wells ?? {}).length).toBeGreaterThan(0)
    })
  })

  describe('enrichStorageContainer', () => {
    it('returns null for missing container', async () => {
      expect(await enrichStorageContainer(testDb, 99999)).toBeNull()
    })
  })

  describe('enrichStorageContainers (batch)', () => {
    it('returns an empty map for empty input', async () => {
      expect((await enrichStorageContainers(testDb, [])).size).toBe(0)
    })

    it('enriches multiple containers with unit and specimen type, omitting missing ids', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'mL', name: 'milliliter', category: 'volume' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Batch Type' })
      const specA = await createTestSpecimen(testDb, specimenType.id)
      const specB = await createTestSpecimen(testDb, specimenType.id)
      const containerA = await createTestStorageContainer(testDb, { specimenId: specA.id, unitId: unit.id })
      const containerB = await createTestStorageContainer(testDb, { specimenId: specB.id, unitId: unit.id })

      const enriched = await enrichStorageContainers(testDb, [containerA.id, containerB.id, 99999])

      expect(enriched.size).toBe(2)
      const a = enriched.get(containerA.id)
      expect(a?.unit?.symbol).toBe('mL')
      expect(a?.specimenTypeName).toBe('Batch Type')
      expect(a?.specimen?.id).toBe(specA.id)
      expect(enriched.get(containerB.id)?.specimenId).toBe(specB.id)
      expect(enriched.has(99999)).toBe(false)
    })
  })
})
