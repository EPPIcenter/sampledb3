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
  createTestSpecimenTypeContainerType,
  createTestContainerTypeUnit,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import {
  normalizePosition,
  runBulkCombinedImport,
  validateBulkCombinedPayload,
  type BulkCombinedSubjectInput,
} from '../bulk-combined-import'
import { studySubject, specimen } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { withWriteTransaction } from '../../db/write-transaction'
import { ConflictError, ValidationError } from '../error-handler'
import { failInsertsWithUniqueViolation } from '../../__tests__/helpers/constraint-race'

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
      for (const containerType of ['micronix_tube', 'paper'] as const) {
        await createTestSpecimenTypeContainerType(testDb, { specimenTypeId: specimenType.id, containerType })
        await createTestContainerTypeUnit(testDb, { containerType, unitId: unit.id })
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

    // per_subject validate checks each subject the way the import runs it, so it flags exactly
    // the subjects the import rejects.
    for (const fixture of fixtures) {
      it(`${fixture.name} (per_subject)`, async () => {
        const payload = { studyShortCode: 'ST1', atomicMode: 'per_subject' as const, subjects: fixture.subjects() }

        const validation = await validateBulkCombinedPayload(testDb, payload)
        const imported = await runBulkCombinedImport(testDb, payload, undefined)

        const flagged = [...new Set(validation.errors.map((e) => e.subjectIndex))]
        const rejected = (imported.errors ?? []).map((e) => e.index)
        expect(validation.valid).toBe(fixture.valid)
        expect(flagged).toEqual(rejected)
      })
    }

    it('per_subject flags a subject that needed a collection from a subject that failed', async () => {
      // B finds the new plate only because A, which fails, would create it. A's rollback drops
      // the plate, so B fails too, in validate as in the import.
      const payload = {
        studyShortCode: 'ST1',
        atomicMode: 'per_subject' as const,
        subjects: [
          subject('A', tube('TAKEN', { name: 'NEW', locationId, position: 'A01' })),
          subject('B', tube('T2', { name: 'NEW', position: 'A02' })),
        ],
      }

      const validation = await validateBulkCombinedPayload(testDb, payload)
      const imported = await runBulkCombinedImport(testDb, payload, undefined)

      expect([...new Set(validation.errors.map((e) => e.subjectIndex))]).toEqual([0, 1])
      expect((imported.errors ?? []).map((e) => e.index)).toEqual([0, 1])
    })

    it('per_subject flags a second subject that gives a new plate another location', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Rack' })
      const otherLocationId = (await createTestLocation(testDb, { name: 'Other shelf', storageTypeId: String(storageType.id), canContainCollections: true })).id
      const payload = {
        studyShortCode: 'ST1',
        atomicMode: 'per_subject' as const,
        subjects: [
          subject('A', tube('T1', { name: 'NEW', locationId, position: 'A01' })),
          subject('B', tube('T2', { name: 'NEW', locationId: otherLocationId, position: 'A02' })),
        ],
      }

      const validation = await validateBulkCombinedPayload(testDb, payload)
      const imported = await runBulkCombinedImport(testDb, payload, undefined)

      expect(validation.errors.map((e) => e.subjectIndex)).toEqual([1])
      expect((imported.errors ?? []).map((e) => e.index)).toEqual([1])
    })

    it('per_subject reports a failed subject with its own index and row', async () => {
      const validation = await validateBulkCombinedPayload(testDb, {
        studyShortCode: 'ST1',
        atomicMode: 'per_subject',
        subjects: [subject('A'), { subjectName: 'B', specimens: [{ specimenTypeName: 'NOPE', rowIndex: 7 }] }],
      })

      expect(validation.errors).toEqual([{ subjectIndex: 1, specimenIndex: 0, rowIndex: 7, message: "Specimen type 'NOPE' not found" }])
    })

    describe('a subject that cannot be found or created', () => {
      // Subject 0 has no Subject record to register under, and its rows have problems of their own.
      const withFailedSubject = (failed: Pick<BulkCombinedSubjectInput, 'subjectName' | 'studyShortCode'>): BulkCombinedSubjectInput[] => [
        {
          ...failed,
          specimens: [
            { specimenTypeName: 'DNA', collectionDate: '2024-01-15', container: tube('TAKEN', { name: 'P1', position: 'B01' }), rowIndex: 2 },
            { specimenTypeName: 'DNA', collectionDate: 'not-a-date', rowIndex: 3 },
            { specimenTypeName: 'NOPE', rowIndex: 4 },
          ],
        },
        subject('B', tube('T2', { name: 'P1', position: 'A01' })),
      ]
      const rowErrors = [
        { subjectIndex: 0, specimenIndex: 0, rowIndex: 2, message: "Barcode 'TAKEN' already exists. Use a different barcode." },
        { subjectIndex: 0, specimenIndex: 1, rowIndex: 3, message: expect.stringContaining('date') },
        { subjectIndex: 0, specimenIndex: 2, rowIndex: 4, message: "Specimen type 'NOPE' not found" },
        { subjectIndex: 1, specimenIndex: 0, message: expect.stringContaining('Position A01 is already used') },
      ]

      it('still reports its specimens and containers when its study is not found', async () => {
        const payload = { studyShortCode: 'ST1', atomicMode: 'full_file' as const, subjects: withFailedSubject({ subjectName: 'A', studyShortCode: 'NOPE' }) }

        const validation = await validateBulkCombinedPayload(testDb, payload)
        const imported = await runBulkCombinedImport(testDb, payload, undefined).catch((e: unknown) => e)

        expect(validation.errors).toEqual([
          { subjectIndex: 0, specimenIndex: 0, rowIndex: 2, message: "Study short code 'NOPE' not found" },
          ...rowErrors,
        ])
        expect(imported).toBeInstanceOf(ValidationError)
        expect((imported as ValidationError).details).toEqual({ errors: validation.errors })
      })

      it('still reports its specimens and containers when its name is not valid', async () => {
        const validation = await validateBulkCombinedPayload(testDb, {
          studyShortCode: 'ST1',
          atomicMode: 'full_file',
          subjects: withFailedSubject({ subjectName: '   ' }),
        })

        expect(validation.errors).toEqual([
          { subjectIndex: 0, specimenIndex: 0, rowIndex: 2, message: 'Subject name cannot be empty' },
          ...rowErrors,
        ])
      })

      it('lists them with the subject\'s own error in per_subject mode, and imports the other subjects', async () => {
        const payload = {
          studyShortCode: 'ST1',
          atomicMode: 'per_subject' as const,
          subjects: [...withFailedSubject({ subjectName: 'A', studyShortCode: 'NOPE' }).slice(0, 1), subject('B', tube('T2', { name: 'P1', position: 'A02' }))],
        }

        const validation = await validateBulkCombinedPayload(testDb, payload)
        const imported = await runBulkCombinedImport(testDb, payload, undefined)

        expect(validation.errors.map((e) => [e.subjectIndex, e.specimenIndex])).toEqual([[0, 0], [0, 0], [0, 1], [0, 2]])
        expect(imported.results.map((r) => r.subject.name)).toEqual(['B'])
        expect(imported.errors).toEqual([
          { index: 0, error: expect.stringContaining("Study short code 'NOPE' not found; Barcode 'TAKEN' already exists") },
        ])
      })
    })

    describe('a constraint hit while creating a subject', () => {
      // 'Existing' is found, so only the new subject is inserted, and that insert is refused.
      const subjects = (): BulkCombinedSubjectInput[] => [
        subject('Existing', tube('T1', { name: 'P1', position: 'B01' })),
        subject('Raced'),
        { subjectName: 'Existing', specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-03-01' }] },
      ]

      beforeEach(() => failInsertsWithUniqueViolation(sqlite, 'study_subject'))

      it('is that subject\'s error in per_subject mode, and the import goes on to the next subject', async () => {
        const imported = await runBulkCombinedImport(testDb, { studyShortCode: 'ST1', atomicMode: 'per_subject', subjects: subjects() }, undefined)

        expect(imported.errors).toEqual([{ index: 1, error: "Subject 'Raced': Subject 'Raced' already exists in Study 'ST1'." }])
        expect(imported.results.map((r) => r.subject.name)).toEqual(['Existing', 'Existing'])
        expect(imported.summary).toMatchObject({ subjectsCreated: 0, specimensCreated: 1, containersCreated: 1 })
      })

      it('is a conflict in full_file mode, and nothing is written', async () => {
        const before = (await testDb.select().from(specimen)).length

        const imported = await runBulkCombinedImport(testDb, { studyShortCode: 'ST1', atomicMode: 'full_file', subjects: subjects() }, undefined).catch(
          (e: unknown) => e
        )

        expect(imported).toBeInstanceOf(ConflictError)
        expect((imported as ConflictError).details).toEqual({
          errors: [{ subjectIndex: 1, specimenIndex: 0, message: "Subject 'Raced' already exists in Study 'ST1'." }],
        })
        expect((await testDb.select().from(specimen)).length).toBe(before)
      })

      it('is reported by validate for that subject', async () => {
        const validation = await validateBulkCombinedPayload(testDb, { studyShortCode: 'ST1', atomicMode: 'per_subject', subjects: subjects() })

        expect(validation.errors).toEqual([
          { subjectIndex: 1, specimenIndex: 0, message: "Subject 'Raced' already exists in Study 'ST1'." },
        ])
      })

      it('replies 400 (ValidationError) listing every subject error when a validation error precedes a subject constraint hit', async () => {
        const payload = {
          studyShortCode: 'ST1',
          atomicMode: 'full_file' as const,
          subjects: [
            { subjectName: 'BadFirst', studyShortCode: 'NOPE', specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-01' }] },
            subject('Raced'),
            { subjectName: 'BadLast', studyShortCode: 'ALSO-NOPE', specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-01-01' }] },
          ],
        }

        const imported = await runBulkCombinedImport(testDb, payload, undefined).catch((e: unknown) => e)

        expect(imported).toBeInstanceOf(ValidationError)
        expect((imported as ValidationError).details).toEqual({
          errors: [
            { subjectIndex: 0, specimenIndex: 0, message: expect.stringContaining("Study short code 'NOPE' not found") },
            { subjectIndex: 1, specimenIndex: 0, message: expect.stringContaining('already exists') },
            { subjectIndex: 2, specimenIndex: 0, message: expect.stringContaining("Study short code 'ALSO-NOPE' not found") },
          ],
        })
      })

      it('replies 400 (ValidationError) when an earlier row failed validation and registration hits a constraint', async () => {
        // Drop the study_subject trigger and put the race on specimen instead.
        sqlite.exec('DROP TRIGGER test_constraint_race_study_subject')
        failInsertsWithUniqueViolation(sqlite, 'specimen')
        const payload = {
          studyShortCode: 'ST1',
          atomicMode: 'full_file' as const,
          subjects: [
            { subjectName: 'Existing', specimens: [{ specimenTypeName: 'MissingType', collectionDate: '2024-01-01' }] },
            { subjectName: 'Existing', specimens: [{ specimenTypeName: 'DNA', collectionDate: '2024-03-01' }] },
          ],
        }

        const imported = await runBulkCombinedImport(testDb, payload, undefined).catch((e: unknown) => e)

        expect(imported).toBeInstanceOf(ValidationError)
        expect((imported as ValidationError).details).toEqual({
          errors: [
            { subjectIndex: 0, specimenIndex: 0, message: "Specimen type 'MissingType' not found" },
            { subjectIndex: 1, specimenIndex: 0, message: expect.stringContaining('already exists') },
          ],
        })
      })
    })

    it('says a sublabel repeats in the file', async () => {
      const validation = await validateBulkCombinedPayload(testDb, {
        studyShortCode: 'ST1',
        atomicMode: 'full_file',
        subjects: [subject('A', paperOn('Sheet-1', 's1')), subject('B', paperOn('Sheet-1', 's1'))],
      })

      expect(validation.errors.map((e) => e.message)).toEqual(["Sublabel 's1' is used more than once on this sheet in your file."])
    })

    for (const fixture of fixtures) {
      it(fixture.name, async () => {
        const payload = { studyShortCode: 'ST1', atomicMode: 'full_file' as const, subjects: fixture.subjects() }

        const validation = await validateBulkCombinedPayload(testDb, payload)
        const imported = await runBulkCombinedImport(testDb, payload, undefined).then(
          () => true,
          () => false
        )

        expect(validation.valid).toBe(fixture.valid)
        expect(imported).toBe(validation.valid)
      })
    }
  })
})
