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
import { createBulkSpecimenRows, validateBulkSpecimenRows, type BulkSpecimenValidateRow } from '../registration-orchestrator'
import { specimenTypeContainerType, containerTypeUnit, micronixTube, staticWell } from '../../db/schema'
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

    it('returns invalid when a micronix tube targets a cell held by a static well', async () => {
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
      await testDb.insert(staticWell).values({ id: container.id, collectionId: plate.id, position: 'A01' })

      const result = await validateBulkSpecimenRows(testDb, [
        {
          sourceType: 'subject',
          studyShortCode: study.shortCode,
          subjectName: subject.name,
          specimenTypeName: specimenType.name,
          container: {
            containerType: 'micronix_tube',
            barcode: 'NEW-TUBE',
            collection: { type: 'micronix_plate', name: plate.name, position: 'A1' },
          },
        },
      ])

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('Position A01 is already used'))).toBe(true)
    })
  })

  describe('validate passes exactly when the import succeeds', () => {
    let locationId: number

    beforeEach(async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      locationId = (await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id), canContainCollections: true })).id
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      for (const containerType of ['micronix_tube', 'paper'] as const) {
        await testDb.insert(specimenTypeContainerType).values({ specimenTypeId: specimenType.id, containerType, created: now, lastUpdated: now })
        await testDb.insert(containerTypeUnit).values({ containerType, unitId: unit.id })
      }
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await createTestMicronixPlate(testDb, { name: 'P1', barcode: 'P1-BC', locationId })
    })

    function row(container?: BulkSpecimenValidateRow['container'], collectionDate = '2024-01-15'): BulkSpecimenValidateRow {
      return { sourceType: 'subject', studyShortCode: 'ST1', subjectName: 'Subj1', specimenTypeName: 'DNA', collectionDate, container }
    }

    function tube(barcode: string, collection: Record<string, unknown>): BulkSpecimenValidateRow['container'] {
      return { containerType: 'micronix_tube', barcode, collection: { type: 'micronix_plate', ...collection } }
    }

    function paperOn(sheetName: string, sublabel: string): BulkSpecimenValidateRow['container'] {
      return {
        containerType: 'paper',
        sublabel,
        collection: { type: 'sheet', name: sheetName, parent: { type: 'box', name: 'PaperBox', locationId } },
      }
    }

    const fixtures: Array<{ name: string; valid: boolean; rows: () => BulkSpecimenValidateRow[] }> = [
      { name: 'existing plate name with an unknown barcode', valid: false, rows: () => [row(tube('T1', { name: 'P1', barcode: 'UNKNOWN', position: 'A01' }))] },
      { name: 'two papers on one new sheet', valid: true, rows: () => [row(paperOn('Sheet-1', 's1')), row(paperOn('Sheet-1', 's2'), '2024-02-01')] },
      { name: 'one well named by plate name and by plate barcode', valid: false, rows: () => [row(tube('T1', { name: 'P1', position: 'C01' })), row(tube('T2', { barcode: 'P1-BC', position: 'C1' }), '2024-02-01')] },
      { name: 'a new plate given two locations', valid: false, rows: () => [row(tube('T1', { name: 'NEW', locationId, position: 'A01' })), row(tube('T2', { name: 'NEW', locationId: locationId + 1000, position: 'A02' }), '2024-02-01')] },
    ]

    for (const fixture of fixtures) {
      it(fixture.name, async () => {
        const validation = await validateBulkSpecimenRows(testDb, fixture.rows())
        const created = await createBulkSpecimenRows(testDb, fixture.rows()).then(
          (result) => result.success,
          () => false,
        )

        expect(validation.valid).toBe(fixture.valid)
        expect(created).toBe(validation.valid)
      })
    }
  })
})
