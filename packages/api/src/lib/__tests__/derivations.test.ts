import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestSpecimen,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import { createDerivation } from '../derivations'
import { specimenTypeContainerType, containerTypeUnit, specimen } from '../../db/schema'
import { storageContainer } from '../../db/schema'
import { micronixTube } from '../../db/schema'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'
import { eq } from 'drizzle-orm'
import { withWriteTransaction } from '../../db/write-transaction'

describe('derivations', () => {
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

  describe('createDerivation', () => {
    it('throws when parent container not found', async () => {
      await expect(
        createDerivation(testDb, {
          parentContainerId: 99999,
          derivationType: 'aliquot',
          specimenTypeName: 'DNA',
          container: {
            containerType: 'micronix_tube',
            barcode: 'MT001',
            collection: { type: 'micronix_plate', id: 1, position: 'A01' },
          },
        })
      ).rejects.toThrow('Parent container not found')
    })

    it('throws when specimen type not found', async () => {
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
      const now = utcNow()
      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: container!.id,
        collectionId: plate.id,
        barcode: 'MT-PARENT',
        position: 'A01',
      })

      await expect(
        createDerivation(testDb, {
          parentContainerId: container!.id,
          derivationType: 'aliquot',
          specimenTypeName: 'NonExistentType',
          container: {
            containerType: 'micronix_tube',
            barcode: 'MT002',
            collection: { type: 'micronix_plate', id: plate.id, position: 'A02' },
          },
        })
      ).rejects.toThrow("Specimen type 'NonExistentType' not found")
    })

    it('creates derivation when parent, specimen type, and collection exist', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
      })
      await testDb.insert(containerTypeUnit).values({
        containerType: 'micronix_tube',
        unitId: unit.id,
      })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const sourcePlate = await createTestMicronixPlate(testDb, { name: 'SourcePlate', locationId: location.id })
      const targetPlate = await createTestMicronixPlate(testDb, { name: 'TargetPlate', locationId: location.id })
      const [parentContainer] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: parentContainer!.id,
        collectionId: sourcePlate.id,
        barcode: 'MT-PARENT',
        position: 'A01',
      })

      const result = await createDerivation(testDb, {
        parentContainerId: parentContainer!.id,
        derivationType: 'aliquot',
        specimenTypeName: 'DNA',
        container: {
          containerType: 'micronix_tube',
          barcode: 'MT-CHILD',
          collection: { type: 'micronix_plate', id: targetPlate.id, position: 'A01' },
        },
      })

      expect(result.derivation).toBeDefined()
      expect(result.derivation.parentContainerId).toBe(parentContainer!.id)
      expect(result.childContainer).toBeDefined()
      expect(result.specimen).toBeDefined()
      expect(result.warnings).toEqual([])
    })

    it('rolls back the derived specimen when child container creation fails', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      const bloodType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const dnaType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: dnaType.id,
        containerType: 'micronix_tube',
        created: now,
      })
      await testDb.insert(containerTypeUnit).values({
        containerType: 'micronix_tube',
        unitId: unit.id,
      })
      const parentSpecimen = await createTestSpecimen(testDb, bloodType.id)
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const sourcePlate = await createTestMicronixPlate(testDb, { name: 'SourcePlate', locationId: location.id })
      const targetPlate = await createTestMicronixPlate(testDb, { name: 'TargetPlate', locationId: location.id })
      const [parentContainer] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: parentSpecimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: parentContainer!.id,
        collectionId: sourcePlate.id,
        barcode: 'MT-PARENT',
        position: 'A01',
      })
      const occupying = await createTestSpecimen(testDb, bloodType.id, {
        studySubjectId: parentSpecimen.studySubjectId ?? undefined,
      })
      const [occupant] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: occupying.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: occupant!.id,
        collectionId: targetPlate.id,
        barcode: 'MT-OCCUPIED',
        position: 'B01',
      })

      const specimenCountBefore = (await testDb.select().from(specimen)).length

      await expect(
        createDerivation(testDb, {
          parentContainerId: parentContainer!.id,
          derivationType: 'extract',
          specimenTypeName: 'DNA',
          container: {
            containerType: 'micronix_tube',
            barcode: 'MT-CHILD',
            collection: { type: 'micronix_plate', id: targetPlate.id, position: 'B01' },
          },
        }),
      ).rejects.toThrow(/already used/)

      expect((await testDb.select().from(specimen)).length).toBe(specimenCountBefore)
      const dnaRows = await testDb.select().from(specimen).where(eq(specimen.specimenTypeId, dnaType.id))
      expect(dnaRows).toHaveLength(0)
    })

    it('commits when called inside an existing transaction', async () => {
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
      })
      await testDb.insert(containerTypeUnit).values({
        containerType: 'micronix_tube',
        unitId: unit.id,
      })
      const parentSpecimen = await createTestSpecimen(testDb, specimenType.id)
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const sourcePlate = await createTestMicronixPlate(testDb, { name: 'SourcePlate', locationId: location.id })
      const targetPlate = await createTestMicronixPlate(testDb, { name: 'TargetPlate', locationId: location.id })
      const [parentContainer] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: parentSpecimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: parentContainer!.id,
        collectionId: sourcePlate.id,
        barcode: 'MT-PARENT',
        position: 'A01',
      })

      const result = await withWriteTransaction(testDb, (tx) =>
        createDerivation(tx, {
          parentContainerId: parentContainer!.id,
          derivationType: 'aliquot',
          specimenTypeName: 'DNA',
          container: {
            containerType: 'micronix_tube',
            barcode: 'MT-CHILD',
            collection: { type: 'micronix_plate', id: targetPlate.id, position: 'A01' },
          },
        }),
      )

      expect(result.derivation.parentContainerId).toBe(parentContainer!.id)
      expect(result.childContainer).toBeDefined()
    })
  })
})
