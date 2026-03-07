import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import { validateBulkCombinedPayload } from '../bulk-combined-validate'
import { specimenTypeContainerType, containerTypeUnit } from '../../db/schema'
import type { Database } from '../../db/client'
describe('bulk-combined-validate', () => {
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

  describe('validateBulkCombinedPayload', () => {
    it('returns invalid when study short code does not exist', async () => {
      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: 'NONEXISTENT',
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-01' }],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some((e) => e.message.toLowerCase().includes('study') || e.message.includes('Invalid study'))).toBe(true)
    })

    it('returns invalid when specimen type is not found', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [{ specimenTypeName: 'NonExistentType', collectionDate: '2024-01-01' }],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes("Specimen type 'NonExistentType' not found"))).toBe(true)
    })

    it('returns invalid when collection date is invalid', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [{ specimenTypeName: specimenType.name, collectionDate: 'not-a-date' }],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.toLowerCase().includes('date') || e.message.includes('Invalid collection date'))).toBe(true)
    })

    it('returns invalid when createCollections uses location that cannot contain collections', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Shelf',
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })
      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: 'ST1',
        createCollections: [{ type: 'micronix_plate', name: 'Plate1', locationId: loc.id }],
        subjects: [{ subjectName: 'Subj1', specimens: [] }],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('cannot contain collections'))).toBe(true)
    })

    it('returns valid for minimal payload with no containers when study and specimen type exist', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [
              { specimenTypeName: specimenType.name, collectionDate: '2024-01-15' },
            ],
          },
        ],
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('returns invalid when micronix container has no plate/box identifier and no collectionLocationId', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = new Date().toISOString()
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

      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [
              {
                specimenTypeName: specimenType.name,
                collectionDate: '2024-01-15',
                container: {
                  containerType: 'micronix_tube',
                  position: 'A01',
                  barcode: 'MT001',
                },
              },
            ],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(
        result.errors.some(
          (e) =>
            e.message.includes('Plate/box name or barcode is required') ||
            e.message.includes('not found')
        )
      ).toBe(true)
    })

    it('returns invalid when micronix container has no barcode', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: loc.id })
      const now = new Date().toISOString()
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

      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [
              {
                specimenTypeName: specimenType.name,
                collectionDate: '2024-01-15',
                container: {
                  containerType: 'micronix_tube',
                  collectionName: plate.name,
                  position: 'A01',
                  barcode: '',
                },
              },
            ],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('Barcode is required for micronix tubes'))).toBe(true)
    })

    it('returns invalid when micronix container has no position', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: loc.id })
      const now = new Date().toISOString()
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

      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [
              {
                specimenTypeName: specimenType.name,
                collectionDate: '2024-01-15',
                container: {
                  containerType: 'micronix_tube',
                  collectionName: plate.name,
                  position: '',
                  barcode: 'MT001',
                },
              },
            ],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('Position is required'))).toBe(true)
    })

    it('includes rowIndex in errors when provided in payload', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const result = await validateBulkCombinedPayload(testDb, {
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [
              { specimenTypeName: 'NonExistent', collectionDate: '2024-01-01', rowIndex: 5 },
            ],
          },
        ],
      })
      expect(result.valid).toBe(false)
      const errWithRow = result.errors.find((e) => e.rowIndex === 5)
      expect(errWithRow).toBeDefined()
      expect(errWithRow?.message).toContain('NonExistent')
    })
  })
})
