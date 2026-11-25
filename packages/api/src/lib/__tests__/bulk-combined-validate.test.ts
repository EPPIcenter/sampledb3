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
import { runBulkCombinedImport, validateBulkCombinedPayload } from '../bulk-combined-import'
import { ValidationError } from '../error-handler'
import { specimenTypeContainerType, containerTypeUnit, storageContainer } from '../../db/schema'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'
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
        atomicMode: 'full_file',
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
        atomicMode: 'full_file',
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
        atomicMode: 'full_file',
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

    it('returns invalid when container collection locationId cannot contain collections', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, {
        name: 'Shelf',
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: specimenType.id,
        containerType: 'micronix_tube',
        created: now,
        lastUpdated: now,
      })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })

      const result = await validateBulkCombinedPayload(testDb, {
        atomicMode: 'full_file',
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
                  barcode: 'MT-LOC',
                  collection: {
                    type: 'micronix_plate',
                    name: 'Plate1',
                    locationId: loc.id,
                    position: 'A01',
                  },
                },
              },
            ],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('cannot contain collections'))).toBe(true)
    })

    it('returns valid for minimal payload with no containers when study and specimen type exist', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const result = await validateBulkCombinedPayload(testDb, {
        atomicMode: 'full_file',
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

      const result = await validateBulkCombinedPayload(testDb, {
        atomicMode: 'full_file',
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
                  barcode: 'MT001',
                  collection: { type: 'micronix_plate', position: 'A01' },
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
            e.message.includes('plate_name') ||
            e.message.includes('Collection name or barcode is required') ||
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

      const result = await validateBulkCombinedPayload(testDb, {
        atomicMode: 'full_file',
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
                  barcode: '',
                  collection: { type: 'micronix_plate', name: plate.name, position: 'A01' },
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

      const result = await validateBulkCombinedPayload(testDb, {
        atomicMode: 'full_file',
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
                  barcode: 'MT001',
                  collection: { type: 'micronix_plate', name: plate.name, position: '' },
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
        atomicMode: 'full_file',
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

    it('validates each subject against its own study', async () => {
      await createTestStudy(testDb, { title: 'Study A', shortCode: 'STA' })
      await createTestStudy(testDb, { title: 'Study B', shortCode: 'STB' })
      await createTestSpecimenType(testDb, { name: 'DNA' })
      const result = await validateBulkCombinedPayload(testDb, {
        atomicMode: 'full_file',
        subjects: [
          {
            studyShortCode: 'STA',
            subjectName: 'P001',
            specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-01', rowIndex: 1 }],
          },
          {
            studyShortCode: 'STB',
            subjectName: 'P001',
            specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-01', rowIndex: 2 }],
          },
          {
            studyShortCode: 'NOPE',
            subjectName: 'P002',
            specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-01', rowIndex: 3 }],
          },
        ],
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatchObject({ subjectIndex: 2, rowIndex: 3 })
      expect(result.errors[0]!.message.toLowerCase()).toContain('study')
    })
  })

  describe('container quantity bounds', () => {
    async function seedMicronixSetup() {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = utcNow()
      await testDb.insert(specimenTypeContainerType).values({ specimenTypeId: specimenType.id, containerType: 'micronix_tube', created: now })
      const defaults = { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' }
      await setContainerDefaults(testDb, { micronix_tube: defaults, cryovial_tube: defaults, paper: defaults, static_well: defaults })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(testDb, { name: 'PL1', locationId: location.id })
      return { study, plate }
    }

    function specimenRow(plateId: number, row: number, quantities: { totalQuantity?: number; remainingQuantity?: number }) {
      return {
        specimenTypeName: 'DNA',
        collectionDate: '2024-01-15',
        rowIndex: row,
        container: {
          containerType: 'micronix_tube' as const,
          barcode: `MT-${row}`,
          collection: { type: 'micronix_plate' as const, id: plateId, position: `A0${row}` },
          ...quantities,
        },
      }
    }

    it('rejects negative quantities and remaining greater than total, with row numbers', async () => {
      const { study, plate } = await seedMicronixSetup()

      const result = await validateBulkCombinedPayload(testDb, {
        atomicMode: 'full_file',
        studyShortCode: study.shortCode,
        subjects: [
          {
            subjectName: 'Subj1',
            specimens: [
              specimenRow(plate.id, 1, { totalQuantity: 5, remainingQuantity: 5 }),
              specimenRow(plate.id, 2, { totalQuantity: -1 }),
              specimenRow(plate.id, 3, { totalQuantity: 5, remainingQuantity: -2 }),
              specimenRow(plate.id, 4, { totalQuantity: 5, remainingQuantity: 6 }),
            ],
          },
        ],
      })

      expect(result.valid).toBe(false)
      expect(result.errors.map((e) => [e.rowIndex, e.message])).toEqual([
        [2, expect.stringContaining('Total quantity must be 0 or more (got -1).')],
        [3, expect.stringContaining('Remaining quantity must be 0 or more (got -2).')],
        [4, expect.stringContaining('Remaining quantity (6) cannot exceed total quantity (5).')],
      ])
    })

    it('rejects the import with the row number and creates nothing', async () => {
      const { study, plate } = await seedMicronixSetup()

      const error = await runBulkCombinedImport(testDb, {
        atomicMode: 'full_file',
        studyShortCode: study.shortCode,
        subjects: [{ subjectName: 'Subj1', specimens: [specimenRow(plate.id, 7, { totalQuantity: 2, remainingQuantity: 3 })] }],
      }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).details.errors).toEqual([
        expect.objectContaining({ rowIndex: 7, message: expect.stringContaining('Remaining quantity (3) cannot exceed total quantity (2).') }),
      ])
      expect(await testDb.select().from(storageContainer)).toHaveLength(0)
    })
  })
})
