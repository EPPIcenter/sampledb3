import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import { validateContainerData, createContainerForSpecimen } from '../container-creation'
import {
  createTestSpecimenType,
  createTestStorageType,
  createTestLocation,
  createTestUnit,
  createTestControlDefinition,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import {
  specimenTypeContainerType,
  containerTypeUnit,
  controlBatch,
  box as boxTable,
  sheet as sheetTable,
  paper as paperTable,
  specimen,
  storageContainer,
} from '../../db/schema'
import { eq, sql } from 'drizzle-orm'
import { utcNow } from '../datetime'

describe('container-creation', () => {
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

  describe('validateContainerData', () => {
    describe('micronix_tube', () => {
      it('returns error when barcode is missing', async () => {
        const result = await validateContainerData(testDb, 'micronix_tube', {
          containerType: 'micronix_tube',
          collectionName: 'Plate1',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Barcode is required for micronix tubes')
      })

      it('returns error when collection name and barcode are missing', async () => {
        const result = await validateContainerData(testDb, 'micronix_tube', {
          containerType: 'micronix_tube',
          barcode: 'MT001',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name or barcode is required')
      })

      it('returns error when position is missing', async () => {
        const result = await validateContainerData(testDb, 'micronix_tube', {
          containerType: 'micronix_tube',
          barcode: 'MT001',
          collectionName: 'Plate1',
          position: '',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Position')
      })
    })

    describe('cryovial_tube', () => {
      it('returns error when collection name and barcode are missing', async () => {
        const result = await validateContainerData(testDb, 'cryovial_tube', {
          containerType: 'cryovial_tube',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name or barcode is required')
      })

      it('returns error when position is empty', async () => {
        const result = await validateContainerData(testDb, 'cryovial_tube', {
          containerType: 'cryovial_tube',
          collectionName: 'Box1',
          position: '   ',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Position')
      })
    })

    describe('paper', () => {
      it('returns error when collection name is missing', async () => {
        const result = await validateContainerData(testDb, 'paper', {
          containerType: 'paper',
          sheetName: 'L1',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name is required for papers')
      })

      it('returns error when sheet name is missing', async () => {
        const result = await validateContainerData(testDb, 'paper', {
          containerType: 'paper',
          collectionName: 'Sheet1',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Sheet name is required for papers')
      })

      it('rejects barcode on paper inbound path', async () => {
        const result = await validateContainerData(testDb, 'paper', {
          containerType: 'paper',
          collectionName: 'Box1',
          sheetName: 'S1',
          barcode: 'P-1',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('sublabel')
      })
    })

    describe('static_well', () => {
      it('returns error when collection name and barcode are missing', async () => {
        const result = await validateContainerData(testDb, 'static_well', {
          containerType: 'static_well',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name or barcode is required')
      })

      it('returns error when position is missing', async () => {
        const result = await validateContainerData(testDb, 'static_well', {
          containerType: 'static_well',
          collectionName: 'Plate1',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Position')
      })
    })
  })

  describe('createContainerForSpecimen (paper)', () => {
    it('creates paper container by resolving box from collectionName and sheet from label', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'spots', name: 'DBS spots', category: 'count' })
      await setContainerDefaults(testDb, {
        paper: { totalQuantity: 100, remainingQuantity: 100, defaultUnitSymbol: 'spots' },
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'paper', unitId: unit.id })

      const specType = await createTestSpecimenType(testDb, { name: 'DBS' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specType.id,
        containerType: 'paper',
        created: now,
      })

      const storageType = await createTestStorageType(testDb, { name: 'Room Temp' })
      const loc = await createTestLocation(testDb, { name: 'Reextraction', storageTypeId: String(storageType.id) })

      const [boxRecord] = await testDb.insert(boxTable).values({
        name: 'TestBox',
        locationId: loc.id,
        created: now,
        lastUpdated: now,
      }).returning()

      const [sheetRecord] = await testDb.insert(sheetTable).values({
        name: 'Sheet2',
        boxId: boxRecord.id,
        created: now,
        lastUpdated: now,
      }).returning()

      const definition = await createTestControlDefinition(testDb, { name: 'DefPaper1' })
      const [batch] = await testDb.insert(controlBatch).values({
        controlDefinitionId: definition.id,
        name: 'Batch-Paper1',
        created: now,
        lastUpdated: now,
      }).returning()

      const [spec] = await testDb.insert(specimen).values({
        specimenTypeId: specType.id,
        controlBatchId: batch.id,
        collectionDate: '2026-04-01',
      }).returning()

      const result = await createContainerForSpecimen(spec.id, {
        containerType: 'paper',
        collection: {
          type: 'sheet',
          name: 'Sheet2',
          parent: { type: 'box', name: 'TestBox' },
        },
      }, testDb)

      expect(result.success).toBe(true)
      expect(result.containerId).toBeDefined()

      const paperRecord = await testDb
        .select()
        .from(paperTable)
        .where(eq(paperTable.id, result.containerId!))
        .get()
      expect(paperRecord).toBeDefined()
      expect(paperRecord!.sheetId).toBe(sheetRecord.id)
    })

    it('creates a new sheet when sheetName does not match existing sheet in box', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'spots', name: 'DBS spots', category: 'count' })
      await setContainerDefaults(testDb, {
        paper: { totalQuantity: 100, remainingQuantity: 100, defaultUnitSymbol: 'spots' },
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'paper', unitId: unit.id })

      const specType = await createTestSpecimenType(testDb, { name: 'DBS' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specType.id,
        containerType: 'paper',
        created: now,
      })

      const storageType = await createTestStorageType(testDb, { name: 'Room Temp' })
      const loc = await createTestLocation(testDb, { name: 'Storage', storageTypeId: String(storageType.id) })

      const [boxRecord] = await testDb.insert(boxTable).values({
        name: 'BoxForNewSheet',
        locationId: loc.id,
        created: now,
        lastUpdated: now,
      }).returning()

      const definition = await createTestControlDefinition(testDb, { name: 'DefPaper2' })
      const [batch] = await testDb.insert(controlBatch).values({
        controlDefinitionId: definition.id,
        name: 'Batch-Paper2',
        created: now,
        lastUpdated: now,
      }).returning()

      const [spec] = await testDb.insert(specimen).values({
        specimenTypeId: specType.id,
        controlBatchId: batch.id,
        collectionDate: '2026-04-01',
      }).returning()

      const result = await createContainerForSpecimen(spec.id, {
        containerType: 'paper',
        collection: {
          type: 'sheet',
          name: 'BrandNewSheet',
          parent: { type: 'box', name: 'BoxForNewSheet' },
        },
      }, testDb)

      expect(result.success).toBe(true)
      expect(result.containerId).toBeDefined()

      const newSheet = await testDb
        .select()
        .from(sheetTable)
        .where(eq(sheetTable.name, 'BrandNewSheet'))
        .get()
      expect(newSheet).toBeDefined()
      expect(newSheet!.boxId).toBe(boxRecord.id)
    })
  })
})
