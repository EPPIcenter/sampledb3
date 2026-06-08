import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestUnit,
  createTestStorageContainer,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import { validateBulkSpecimenRows } from '../registration-orchestrator'
import { specimenTypeContainerType, containerTypeUnit, micronixTube } from '../../db/schema'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'

describe('registration-orchestrator', () => {
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

  describe('validateBulkSpecimenRows', () => {
    it('returns valid for a subject specimen with no container', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })

      const result = await validateBulkSpecimenRows(testDb, [
        {
          sourceType: 'subject',
          studyShortCode: study.shortCode,
          subjectName: subject.name,
          specimenTypeName: specimenType.name,
          collectionDate: '2024-01-15',
        },
      ])

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('returns invalid when subject is not found in study', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })

      const result = await validateBulkSpecimenRows(testDb, [
        {
          sourceType: 'subject',
          studyShortCode: study.shortCode,
          subjectName: 'Missing Subject',
          specimenTypeName: specimenType.name,
        },
      ])

      expect(result.valid).toBe(false)
      expect(result.errors[0]?.message).toContain('Missing Subject')
    })

    it('returns invalid when specimen type is not found', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })

      const result = await validateBulkSpecimenRows(testDb, [
        {
          sourceType: 'subject',
          studyShortCode: study.shortCode,
          subjectName: subject.name,
          specimenTypeName: 'UnknownType',
        },
      ])

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes("Specimen type 'UnknownType' not found"))).toBe(true)
    })

    it('returns invalid when duplicate barcodes appear in the payload', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: loc.id })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
        lastUpdated: now,
      })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })

      const result = await validateBulkSpecimenRows(testDb, [
        {
          sourceType: 'subject',
          studyShortCode: study.shortCode,
          subjectName: subject.name,
          specimenTypeName: specimenType.name,
          container: {
            containerType: 'micronix_tube',
            barcode: 'DUP001',
            collection: { type: 'micronix_plate', name: plate.name, position: 'A01' },
          },
        },
        {
          sourceType: 'subject',
          studyShortCode: study.shortCode,
          subjectName: subject.name,
          specimenTypeName: specimenType.name,
          container: {
            containerType: 'micronix_tube',
            barcode: 'DUP001',
            collection: { type: 'micronix_plate', name: plate.name, position: 'A02' },
          },
        },
      ])

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('used more than once in your file'))).toBe(true)
    })

    it('returns invalid when barcode already exists in database', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: loc.id })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
        lastUpdated: now,
      })
      const container = await createTestStorageContainer(testDb)
      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: 'EXISTING',
        position: 'B01',
        created: now,
        lastUpdated: now,
      })

      const result = await validateBulkSpecimenRows(testDb, [
        {
          sourceType: 'subject',
          studyShortCode: study.shortCode,
          subjectName: subject.name,
          specimenTypeName: specimenType.name,
          container: {
            containerType: 'micronix_tube',
            barcode: 'EXISTING',
            collection: { type: 'micronix_plate', name: plate.name, position: 'A01' },
          },
        },
      ])

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes("Barcode 'EXISTING' already exists"))).toBe(true)
    })
  })
})
