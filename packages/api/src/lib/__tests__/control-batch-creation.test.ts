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
import { specimenTypeContainerType, containerTypeUnit } from '../../db/schema'
import type { Database } from '../../db/client'

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
      const now = new Date().toISOString()
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
      const now = new Date().toISOString()
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
      const now = new Date().toISOString()
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
  })
})
