import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestControlDefinition,
  createTestSpecimenType,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { setContainerDefaults, clearSettingsCache } from '../../settings'
import { clearDefaultsCache } from '../../defaults'
import { createBatchWithSpecimens } from '../batch-with-specimens'
import { specimenTypeContainerType, containerTypeUnit, storageContainer, box } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../../db/client'
import { utcNow } from '../../datetime'

describe('batch-with-specimens', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    clearSettingsCache()
    clearDefaultsCache()
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    clearDefaultsCache()
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('createBatchWithSpecimens', () => {
    it('throws when control definition not found', async () => {
      await expect(
        createBatchWithSpecimens(testDb, {
          batch: { controlDefinitionId: 99999, name: 'Batch1' },
          specimens: [
            {
              specimenTypeName: 'DNA',
              containers: [
                {
                  containerType: 'micronix_tube',
                  barcode: 'MT1',
                  collection: { type: 'micronix_plate', id: 1, position: 'A01' },
                },
              ],
            },
          ],
        })
      ).rejects.toThrow(/Control definition with ID 99999 not found/)
    })

    it('throws when specimen type not found', async () => {
      const definition = await createTestControlDefinition(testDb, { name: 'Def1' })
      await expect(
        createBatchWithSpecimens(testDb, {
          batch: { controlDefinitionId: definition.id, name: 'Batch1' },
          specimens: [
            {
              specimenTypeName: 'NonExistentType',
              containers: [
                {
                  containerType: 'micronix_tube',
                  barcode: 'MT1',
                  collection: { type: 'micronix_plate', id: 1, position: 'A01' },
                },
              ],
            },
          ],
        })
      ).rejects.toThrow(/Specimen type not found: NonExistentType/)
    })

    it('creates batch with specimens and micronix containers when setup is valid', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await testDb.insert(containerTypeUnit).values({
        containerType: 'micronix_tube',
        unitId: unit.id,
      })
      const definition = await createTestControlDefinition(testDb, { name: 'Def1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
      })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })

      const result = await createBatchWithSpecimens(testDb, {
        batch: { controlDefinitionId: definition.id, name: 'Batch1' },
        specimens: [
          {
            specimenTypeName: 'DNA',
            containers: [
              {
                containerType: 'micronix_tube',
                barcode: 'MT001',
                collection: { type: 'micronix_plate', id: plate.id, position: 'A01' },
              },
            ],
          },
        ],
      })

      expect(result.batch).toBeDefined()
      expect(result.batch.name).toBe('Batch1')
      expect(result.batch.controlDefinitionId).toBe(definition.id)
      expect(result.specimens).toHaveLength(1)
      expect(result.specimens[0].specimenTypeName).toBe('DNA')
      expect(result.specimens[0].containerCount).toBe(1)
      expect(result.specimens[0].containerIds).toHaveLength(1)
    })

    it('throws when paper container is missing sheet name', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'paper', unitId: unit.id })
      const definition = await createTestControlDefinition(testDb, { name: 'DefPaper' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'paper',
        created: now,
      })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'LocPaper', storageTypeId: String(storageType.id) })

      await expect(
        createBatchWithSpecimens(testDb, {
          batch: { controlDefinitionId: definition.id, name: 'BatchPaper' },
          specimens: [
            {
              specimenTypeName: 'DNA',
              containers: [
                {
                  containerType: 'paper',
                  sublabel: 'P001',
                  collection: {
                    type: 'sheet',
                    parent: { type: 'box', name: 'Box1', locationId: location.id },
                  },
                },
              ],
            },
          ],
        })
      ).rejects.toThrow(/Sheet name is required for papers/i)
    })

    it('throws when container type is not allowed for specimen type', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await testDb.insert(containerTypeUnit).values([
        { containerType: 'micronix_tube', unitId: unit.id },
        { containerType: 'cryovial_tube', unitId: unit.id },
      ])
      const definition = await createTestControlDefinition(testDb, { name: 'Def2' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'RNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
      })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer2' })
      const location = await createTestLocation(testDb, { name: 'Loc2', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate2', locationId: location.id })

      await expect(
        createBatchWithSpecimens(testDb, {
          batch: { controlDefinitionId: definition.id, name: 'Batch2' },
          specimens: [
            {
              specimenTypeName: 'RNA',
              containers: [
                {
                  containerType: 'cryovial_tube',
                  barcode: 'CV001',
                  collection: { type: 'cryovial_box', id: plate.id, position: 'A01' },
                },
              ],
            },
          ],
        })
      ).rejects.toThrow(/Container type|not allowed|validation/i)
    })

    it('creates batch with multiple specimen types and multiple containers', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
      const definition = await createTestControlDefinition(testDb, { name: 'Def3' })
      const type1 = await createTestSpecimenType(testDb, { name: 'TypeA' })
      const type2 = await createTestSpecimenType(testDb, { name: 'TypeB' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values([
        { specimenTypeId: type1.id, containerType: 'micronix_tube', created: now },
        { specimenTypeId: type2.id, containerType: 'micronix_tube', created: now },
      ])
      const storageType = await createTestStorageType(testDb, { name: 'Freezer3' })
      const location = await createTestLocation(testDb, { name: 'Loc3', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate3', locationId: location.id })

      const result = await createBatchWithSpecimens(testDb, {
        batch: { controlDefinitionId: definition.id, name: 'Batch3' },
        specimens: [
          {
            specimenTypeName: 'TypeA',
            containers: [
              {
                containerType: 'micronix_tube',
                barcode: 'MT-A1',
                collection: { type: 'micronix_plate', id: plate.id, position: 'A01' },
              },
              {
                containerType: 'micronix_tube',
                barcode: 'MT-A2',
                collection: { type: 'micronix_plate', id: plate.id, position: 'A02' },
              },
            ],
          },
          {
            specimenTypeName: 'TypeB',
            containers: [
              {
                containerType: 'micronix_tube',
                barcode: 'MT-B1',
                collection: { type: 'micronix_plate', id: plate.id, position: 'B01' },
              },
            ],
          },
        ],
      })

      expect(result.batch.name).toBe('Batch3')
      expect(result.specimens).toHaveLength(2)
      expect(result.specimens[0].specimenTypeName).toBe('TypeA')
      expect(result.specimens[0].containerCount).toBe(2)
      expect(result.specimens[1].specimenTypeName).toBe('TypeB')
      expect(result.specimens[1].containerCount).toBe(1)
    })

    it('reuses existing box when same collection name is referenced across batches', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'spots', name: 'spots', category: 'count' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'paper', unitId: unit.id })
      const definition = await createTestControlDefinition(testDb, { name: 'DefBox' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DBS' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'paper',
        created: now,
      })
      const storageType = await createTestStorageType(testDb, { name: 'Shelf' })
      const locA = await createTestLocation(testDb, {
        name: 'Location A',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })

      await createBatchWithSpecimens(testDb, {
        batch: { controlDefinitionId: definition.id, name: 'Batch-1' },
        specimens: [{
          specimenTypeName: 'DBS',
          containers: [{
            containerType: 'paper',
            collection: {
              type: 'sheet',
              name: 'Sheet 1',
              parent: { type: 'box', name: 'Shared Box', locationId: locA.id },
            },
          }],
        }],
      })

      await createBatchWithSpecimens(testDb, {
        batch: { controlDefinitionId: definition.id, name: 'Batch-2' },
        specimens: [{
          specimenTypeName: 'DBS',
          containers: [{
            containerType: 'paper',
            collection: {
              type: 'sheet',
              name: 'Sheet 2',
              parent: { type: 'box', name: 'Shared Box', locationId: locA.id },
            },
          }],
        }],
      })

      const boxes = await testDb.select().from(box)
      const matchingBoxes = boxes.filter(b => b.name === 'Shared Box')
      expect(matchingBoxes).toHaveLength(1)
    })

    it('uses default unit for container when unitSymbol is omitted', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
      const definition = await createTestControlDefinition(testDb, { name: 'DefUnit' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
      })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })

      const result = await createBatchWithSpecimens(testDb, {
        batch: { controlDefinitionId: definition.id, name: 'BatchUnit' },
        specimens: [
          {
            specimenTypeName: 'DNA',
            containers: [
              {
                containerType: 'micronix_tube',
                barcode: 'MT001',
                collection: { type: 'micronix_plate', id: plate.id, position: 'A01' },
              },
            ],
          },
        ],
      })

      const containerId = result.specimens[0].containerIds?.[0]
      expect(containerId).toBeDefined()
      const created = await testDb.select().from(storageContainer).where(eq(storageContainer.id, containerId!)).get()
      expect(created).toBeDefined()
      expect(created.unitId).toBe(unit.id)
    })
  })
})
