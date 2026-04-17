import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestControlDefinition,
  createTestSpecimenType,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import { createBatchWithSpecimens } from '../control-batch-creation'
import { specimenTypeContainerType, containerTypeUnit, storageContainer, box } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'

describe('control-batch-creation', () => {
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

  describe('createBatchWithSpecimens', () => {
    it('throws when control definition not found', async () => {
      await expect(
        createBatchWithSpecimens(testDb, {
          batch: { controlDefinitionId: 99999, name: 'Batch1' },
          specimens: [
            {
              specimenTypeName: 'DNA',
              containers: [
                { type: 'micronix_tube', collectionId: 1, position: 'A01', containerBarcode: 'MT1' },
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
                { type: 'micronix_tube', collectionId: 1, position: 'A01', containerBarcode: 'MT1' },
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
                type: 'micronix_tube',
                collectionId: plate.id,
                position: 'A01',
                containerBarcode: 'MT001',
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
                  type: 'paper',
                  collectionName: 'Box1',
                  collectionLocationId: location.id,
                  position: 'A1',
                  containerBarcode: 'P001',
                  // sheetName omitted
                },
              ],
            },
          ],
        })
      ).rejects.toThrow(/Sheet name is required for paper/)
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
                  type: 'cryovial_tube',
                  collectionId: plate.id,
                  position: 'A01',
                  containerBarcode: 'CV001',
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
              { type: 'micronix_tube', collectionId: plate.id, position: 'A01', containerBarcode: 'MT-A1' },
              { type: 'micronix_tube', collectionId: plate.id, position: 'A02', containerBarcode: 'MT-A2' },
            ],
          },
          {
            specimenTypeName: 'TypeB',
            containers: [
              { type: 'micronix_tube', collectionId: plate.id, position: 'B01', containerBarcode: 'MT-B1' },
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
      const locA = await createTestLocation(testDb, { name: 'Location A', storageTypeId: String(storageType.id) })

      const result1 = await createBatchWithSpecimens(testDb, {
        batch: { controlDefinitionId: definition.id, name: 'Batch-1' },
        specimens: [{
          specimenTypeName: 'DBS',
          containers: [{
            type: 'paper',
            collectionName: 'Shared Box',
            collectionLocationId: locA.id,
            collectionType: 'box',
            sheetName: 'Sheet 1',
          }],
        }],
        createCollections: [{
          type: 'box',
          name: 'Shared Box',
          locationId: locA.id,
        }],
      })

      const result2 = await createBatchWithSpecimens(testDb, {
        batch: { controlDefinitionId: definition.id, name: 'Batch-2' },
        specimens: [{
          specimenTypeName: 'DBS',
          containers: [{
            type: 'paper',
            collectionName: 'Shared Box',
            collectionLocationId: locA.id,
            collectionType: 'box',
            sheetName: 'Sheet 2',
          }],
        }],
        createCollections: [{
          type: 'box',
          name: 'Shared Box',
          locationId: locA.id,
        }],
      })

      const boxes = await testDb.select().from(box)
      const matchingBoxes = boxes.filter(b => b.name === 'Shared Box')
      expect(matchingBoxes).toHaveLength(1)
      expect(result1.createdCollections).toHaveLength(1)
      expect(result2.createdCollections).toHaveLength(1)
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
                type: 'micronix_tube',
                collectionId: plate.id,
                position: 'A01',
                containerBarcode: 'MT001',
                // unitSymbol deliberately omitted
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
