import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import {
  normalizePosition,
  runBulkCombinedImport,
  validateBulkCombinedPayload,
  type BulkCombinedSubjectInput,
} from '../bulk-combined-import'
import { specimenTypeContainerType, containerTypeUnit, studySubject, specimen } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'
import { withWriteTransaction } from '../../db/write-transaction'

describe('bulk-combined-import', () => {
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

  describe('normalizePosition', () => {
    it('returns null for empty or whitespace', () => {
      expect(normalizePosition('')).toBeNull()
      expect(normalizePosition('   ')).toBeNull()
      expect(normalizePosition(null)).toBeNull()
      expect(normalizePosition(undefined)).toBeNull()
    })

    it('normalizes A1 to A01', () => {
      expect(normalizePosition('A1')).toBe('A01')
      expect(normalizePosition('a1')).toBe('A01')
    })

    it('keeps A01 as A01', () => {
      expect(normalizePosition('A01')).toBe('A01')
    })

    it('trims and normalizes', () => {
      expect(normalizePosition('  B12  ')).toBe('B12')
    })
  })

  describe('runBulkCombinedImport', () => {
    it('throws when study does not exist (full_file mode)', async () => {
      await expect(
        runBulkCombinedImport(
          testDb,
          {
            studyShortCode: 'NONEXISTENT',
            atomicMode: 'full_file',
            subjects: [
              {
                subjectName: 'Subj1',
                specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-01' }],
              },
            ],
          },
          undefined
        )
      ).rejects.toThrow()
    })

    it('creates subject and specimen when payload is valid and no containers (full_file)', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const result = await runBulkCombinedImport(
        testDb,
        {
          studyShortCode: study.shortCode,
          atomicMode: 'full_file',
          subjects: [
            {
              subjectName: 'BulkSubj1',
              specimens: [
                {
                  specimenTypeName: specimenType.name,
                  collectionDate: '2024-01-15',
                },
              ],
            },
          ],
        },
        undefined
      )
      expect(result.summary.subjectsCreated).toBe(1)
      expect(result.summary.specimensCreated).toBe(1)
      expect(result.summary.containersCreated).toBe(0)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].subject.name).toBe('BulkSubj1')
      expect(result.results[0].specimens).toHaveLength(1)

      const subjects = await testDb.select().from(studySubject).where(eq(studySubject.name, 'BulkSubj1'))
      expect(subjects.length).toBe(1)
      const specimensForSubject = await testDb.select().from(specimen).where(eq(specimen.studySubjectId, subjects[0].id))
      expect(specimensForSubject.length).toBe(1)
    })

    it('per_subject mode collects errors and continues with next subject', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const result = await runBulkCombinedImport(
        testDb,
        {
          studyShortCode: study.shortCode,
          atomicMode: 'per_subject',
          subjects: [
            {
              subjectName: 'GoodSubj',
              specimens: [{ specimenTypeName: specimenType.name, collectionDate: '2024-01-15' }],
            },
            {
              subjectName: 'BadSubj',
              specimens: [{ specimenTypeName: 'NonExistentType', collectionDate: '2024-01-15' }],
            },
            {
              subjectName: 'GoodSubj2',
              specimens: [{ specimenTypeName: specimenType.name, collectionDate: '2024-01-16' }],
            },
          ],
        },
        undefined
      )
      expect(result.results).toHaveLength(2)
      expect(result.errors).toBeDefined()
      expect(result.errors).toHaveLength(1)
      expect(result.errors![0].index).toBe(1)
      expect(result.errors![0].error).toMatch(/NonExistentType|not found/i)
      expect(result.summary.subjectsCreated).toBe(2)
      expect(result.summary.specimensCreated).toBe(2)
    })

    it('per_subject mode inside an open transaction rolls back only the failed subject', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })

      const result = await withWriteTransaction(testDb, (tx) =>
        runBulkCombinedImport(
          tx,
          {
            studyShortCode: study.shortCode,
            atomicMode: 'per_subject',
            subjects: [
              { subjectName: 'GoodSubj', specimens: [{ specimenTypeName: specimenType.name, collectionDate: '2024-01-15' }] },
              { subjectName: 'BadSubj', specimens: [{ specimenTypeName: 'NonExistentType', collectionDate: '2024-01-15' }] },
            ],
          },
          undefined
        )
      )

      expect(result.errors).toHaveLength(1)
      const subjects = await testDb.select().from(studySubject).all()
      expect(subjects.map((s) => s.name)).toEqual(['GoodSubj'])
    })

    for (const atomicMode of ['full_file', 'per_subject'] as const) {
      it(`places each subject in its own study for a mixed-study plate (${atomicMode})`, async () => {
        const studyA = await createTestStudy(testDb, { title: 'Study A', shortCode: 'STA' })
        const studyB = await createTestStudy(testDb, { title: 'Study B', shortCode: 'STB' })
        const studyC = await createTestStudy(testDb, { title: 'Study C', shortCode: 'STC' })
        const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
        const specimens = [{ specimenTypeName: specimenType.name, collectionDate: '2024-01-15' }]

        const result = await runBulkCombinedImport(
          testDb,
          {
            atomicMode,
            subjects: [
              { studyShortCode: 'STA', subjectName: 'P001', specimens },
              { studyShortCode: 'STB', subjectName: 'P001', specimens },
              { studyShortCode: 'STC', subjectName: 'P002', specimens },
            ],
          },
          undefined
        )

        expect(result.errors).toBeUndefined()
        expect(result.summary.subjectsCreated).toBe(3)
        expect(result.summary.specimensCreated).toBe(3)
        const subjects = await testDb.select().from(studySubject).all()
        expect(subjects.map((s) => [s.studyId, s.name]).sort()).toEqual(
          [
            [studyA.id, 'P001'],
            [studyB.id, 'P001'],
            [studyC.id, 'P002'],
          ].sort()
        )
      })
    }

    for (const atomicMode of ['full_file', 'per_subject'] as const) {
      it(`merges entries whose subject names match after trimming (${atomicMode})`, async () => {
        const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
        const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })

        const result = await runBulkCombinedImport(
          testDb,
          {
            studyShortCode: study.shortCode,
            atomicMode,
            subjects: [
              { subjectName: 'S1', specimens: [{ specimenTypeName: specimenType.name, collectionDate: '2024-01-15' }] },
              { subjectName: 'S1 ', specimens: [{ specimenTypeName: specimenType.name, collectionDate: '2024-02-15' }] },
            ],
          },
          undefined
        )

        expect(result.errors).toBeUndefined()
        expect(result.summary.subjectsCreated).toBe(1)
        expect(result.summary.subjectsUpdated).toBe(1)
        const subjects = await testDb.select().from(studySubject).all()
        expect(subjects.map((s) => s.name)).toEqual(['S1'])
        expect(await testDb.select().from(specimen).where(eq(specimen.studySubjectId, subjects[0].id))).toHaveLength(2)
      })
    }

    it('stores collection dates as YYYY-MM-DD and treats equivalent forms as one event', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })

      const result = await runBulkCombinedImport(
        testDb,
        {
          studyShortCode: study.shortCode,
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'D1', specimens: [{ specimenTypeName: specimenType.name, collectionDate: '1/5/2024' }] },
            { subjectName: 'D1', specimens: [{ specimenTypeName: specimenType.name, collectionDate: '2024-01-05' }] },
          ],
        },
        undefined
      )

      expect(result.summary.specimensCreated).toBe(1)
      const specimens = await testDb.select().from(specimen).all()
      expect(specimens.map((s) => s.collectionDate)).toEqual(['2024-01-05'])
    })

    it('rejects an impossible collection date', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      await expect(
        runBulkCombinedImport(
          testDb,
          {
            studyShortCode: study.shortCode,
            atomicMode: 'full_file',
            subjects: [{ subjectName: 'D1', specimens: [{ specimenTypeName: specimenType.name, collectionDate: '2024-02-30' }] }],
          },
          undefined
        )
      ).rejects.toThrow(/Invalid date/)
    })

    it('uses the top-level study for subjects without their own study', async () => {
      const studyA = await createTestStudy(testDb, { title: 'Study A', shortCode: 'STA' })
      const studyB = await createTestStudy(testDb, { title: 'Study B', shortCode: 'STB' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const specimens = [{ specimenTypeName: specimenType.name, collectionDate: '2024-01-15' }]

      await runBulkCombinedImport(
        testDb,
        {
          studyShortCode: 'STA',
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'Default', specimens },
            { studyShortCode: 'STB', subjectName: 'Override', specimens },
          ],
        },
        undefined
      )

      const subjects = await testDb.select().from(studySubject).all()
      expect(subjects.find((s) => s.name === 'Default')?.studyId).toBe(studyA.id)
      expect(subjects.find((s) => s.name === 'Override')?.studyId).toBe(studyB.id)
    })
  })

  describe('validate passes exactly when the import succeeds', () => {
    let locationId: number

    beforeEach(async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      await createTestStudySubject(testDb, { studyId: study.id, name: 'Existing' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      locationId = (await createTestLocation(testDb, { name: 'Shelf', storageTypeId: String(storageType.id), canContainCollections: true })).id
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
      const plate = await createTestMicronixPlate(testDb, { name: 'P1', barcode: 'P1-BC', locationId })
      await runBulkCombinedImport(
        testDb,
        { studyShortCode: 'ST1', atomicMode: 'full_file', subjects: [subject('Existing', tube('TAKEN', { id: plate.id, position: 'A01' }))] },
        undefined
      )
    })

    function tube(barcode: string, collection: Record<string, unknown>) {
      return { containerType: 'micronix_tube' as const, barcode, collection: { type: 'micronix_plate' as const, ...collection } }
    }

    function paperOn(sheetName: string, sublabel: string) {
      return {
        containerType: 'paper' as const,
        sublabel,
        collection: { type: 'sheet' as const, name: sheetName, parent: { type: 'box' as const, name: 'PaperBox', locationId } },
      }
    }

    function subject(name: string, container?: NonNullable<BulkCombinedSubjectInput['specimens'][number]['container']>, studyShortCode?: string): BulkCombinedSubjectInput {
      return { subjectName: name, studyShortCode, specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-15', container }] }
    }

    const fixtures: Array<{ name: string; valid: boolean; subjects: () => BulkCombinedSubjectInput[] }> = [
      { name: 'tubes on an existing and a new plate', valid: true, subjects: () => [subject('A', tube('T1', { name: 'P1', position: 'A02' })), subject('B', tube('T2', { name: 'NEW', locationId, position: 'A01' }))] },
      { name: 'existing plate name with an unknown barcode', valid: false, subjects: () => [subject('A', tube('T1', { name: 'P1', barcode: 'UNKNOWN', position: 'A01' }))] },
      { name: 'two subjects with papers on one sheet', valid: true, subjects: () => [subject('A', paperOn('Sheet-1', 's1')), subject('B', paperOn('Sheet-1', 's2'))] },
      { name: 'one sublabel twice on a sheet across subjects', valid: false, subjects: () => [subject('A', paperOn('Sheet-1', 's1')), subject('B', paperOn('Sheet-1', 's1'))] },
      { name: 'a barcode already in the database', valid: false, subjects: () => [subject('A', tube('TAKEN', { name: 'P1', position: 'B01' }))] },
      { name: 'one well named by plate name and by plate barcode', valid: false, subjects: () => [subject('A', tube('T1', { name: 'P1', position: 'C01' })), subject('B', tube('T2', { barcode: 'P1-BC', position: 'C1' }))] },
      { name: 'an occupied well', valid: false, subjects: () => [subject('A', tube('T1', { barcode: 'P1-BC', position: 'A1' }))] },
      { name: 'a missing study on one subject', valid: false, subjects: () => [subject('A'), subject('B', undefined, 'NOPE')] },
    ]

    // per_subject commits each subject that passes, so the property is weaker: validate passes
    // exactly when every subject imports, and each subject validate flags is one the import rejects.
    for (const fixture of fixtures) {
      it(`${fixture.name} (per_subject)`, async () => {
        const payload = { studyShortCode: 'ST1', subjects: fixture.subjects() }

        const validation = await validateBulkCombinedPayload(testDb, payload)
        const imported = await runBulkCombinedImport(testDb, { ...payload, atomicMode: 'per_subject' }, undefined)

        const flagged = new Set(validation.errors.map((e) => e.subjectIndex))
        const rejected = new Set((imported.errors ?? []).map((e) => e.index))
        expect(validation.valid).toBe(fixture.valid)
        expect(rejected.size === 0).toBe(validation.valid)
        expect([...flagged].every((index) => rejected.has(index))).toBe(true)
      })
    }

    it('per_subject also rejects a subject that needed a collection from a subject that failed', async () => {
      // B finds the new plate only because A, which fails, would create it. Validate checks the
      // file as one import, so it flags A alone; per_subject drops A's plate and B fails too.
      const subjects = () => [
        subject('A', tube('TAKEN', { name: 'NEW', locationId, position: 'A01' })),
        subject('B', tube('T2', { name: 'NEW', position: 'A02' })),
      ]

      const validation = await validateBulkCombinedPayload(testDb, { studyShortCode: 'ST1', subjects: subjects() })
      const imported = await runBulkCombinedImport(testDb, { studyShortCode: 'ST1', subjects: subjects(), atomicMode: 'per_subject' }, undefined)

      expect(validation.errors.map((e) => e.subjectIndex)).toEqual([0])
      expect((imported.errors ?? []).map((e) => e.index)).toEqual([0, 1])
    })

    it('says a sublabel repeats in the file', async () => {
      const validation = await validateBulkCombinedPayload(testDb, {
        studyShortCode: 'ST1',
        subjects: [subject('A', paperOn('Sheet-1', 's1')), subject('B', paperOn('Sheet-1', 's1'))],
      })

      expect(validation.errors.map((e) => e.message)).toEqual(["Sublabel 's1' is used more than once on this sheet in your file."])
    })

    for (const fixture of fixtures) {
      it(fixture.name, async () => {
        const payload = { studyShortCode: 'ST1', subjects: fixture.subjects() }

        const validation = await validateBulkCombinedPayload(testDb, payload)
        const imported = await runBulkCombinedImport(testDb, { ...payload, atomicMode: 'full_file' }, undefined).then(
          () => true,
          () => false
        )

        expect(validation.valid).toBe(fixture.valid)
        expect(imported).toBe(validation.valid)
      })
    }
  })
})
