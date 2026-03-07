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
  prepareSubjectWithSpecimens,
} from '../bulk-combined-import'
import { specimenTypeContainerType, containerTypeUnit, studySubject, specimen } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'

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

  describe('prepareSubjectWithSpecimens', () => {
    it('throws when study short code is invalid', async () => {
      await expect(
        prepareSubjectWithSpecimens(testDb, 'NONEXISTENT', 'Subj1', [
          { specimenTypeName: 'DNA', collectionDate: '2024-01-01' },
        ])
      ).rejects.toThrow(/Invalid study|study/i)
    })

    it('resolves study and specimen type and returns prepared subject without container', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const prepared = await prepareSubjectWithSpecimens(testDb, study.shortCode, 'NewSubject', [
        { specimenTypeName: specimenType.name, collectionDate: '2024-01-15' },
      ])
      expect(prepared.studyId).toBe(study.id)
      expect(prepared.trimmedName).toBe('NewSubject')
      expect(prepared.existingSubjectId).toBeNull()
      expect(prepared.resolvedSpecimens).toHaveLength(1)
      expect(prepared.resolvedSpecimens[0].specimenTypeId).toBe(specimenType.id)
      expect(prepared.resolvedSpecimens[0].collectionDate).toBe('2024-01-15')
    })

    it('finds existing subject by name and study', async () => {
      const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
      const existing = await createTestStudySubject(testDb, { studyId: study.id, name: 'ExistingSubj' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const prepared = await prepareSubjectWithSpecimens(testDb, study.shortCode, '  ExistingSubj  ', [
        { specimenTypeName: specimenType.name, collectionDate: '2024-01-15' },
      ])
      expect(prepared.existingSubjectId).toBe(existing.id)
      expect(prepared.trimmedName).toBe('ExistingSubj')
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
  })
})
