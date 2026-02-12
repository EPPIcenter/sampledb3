import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
} from '../../__tests__/helpers/factories'
import { specimen } from '../../db/schema'
import type { Database } from '../../db/client'
import { findExistingStudySpecimen, findExistingControlSpecimen } from '../specimen-helpers'
import { createTestControlDefinition, createTestControlBatch } from '../../__tests__/helpers/factories'

describe('specimen-helpers', () => {
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

  describe('findExistingStudySpecimen', () => {
    it('returns null when no specimen matches', async () => {
      const study = await createTestStudy(testDb, {
        title: 'Study A',
        shortCode: 'SA',
      })
      const subject = await createTestStudySubject(testDb, {
        studyId: study.id,
        name: 'S1',
      })
      const specType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const result = findExistingStudySpecimen(
        testDb,
        subject.id,
        specType.id,
        '2024-01-15'
      )
      expect(result).toBeNull()
    })

    it('returns specimen when matching by subject, type, and date', async () => {
      const study = await createTestStudy(testDb, {
        title: 'Study B',
        shortCode: 'SB',
      })
      const subject = await createTestStudySubject(testDb, {
        studyId: study.id,
        name: 'S2',
      })
      const specType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const now = new Date().toISOString()
      const [inserted] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: specType.id,
          collectionDate: '2024-02-01',
          created: now,
          lastUpdated: now,
        })
        .returning()

      const result = findExistingStudySpecimen(
        testDb,
        subject.id,
        specType.id,
        '2024-02-01'
      )
      expect(result).not.toBeNull()
      expect(result!.id).toBe(inserted!.id)
    })

    it('returns null when collection date does not match', async () => {
      const study = await createTestStudy(testDb, {
        title: 'Study C',
        shortCode: 'SC',
      })
      const subject = await createTestStudySubject(testDb, {
        studyId: study.id,
        name: 'S3',
      })
      const specType = await createTestSpecimenType(testDb, { name: 'Serum' })
      const now = new Date().toISOString()
      await testDb.insert(specimen).values({
        studySubjectId: subject.id,
        specimenTypeId: specType.id,
        collectionDate: '2024-03-01',
        created: now,
        lastUpdated: now,
      }).returning()

      const result = findExistingStudySpecimen(
        testDb,
        subject.id,
        specType.id,
        '2024-03-02'
      )
      expect(result).toBeNull()
    })

    it('matches null/empty collectionDate with specimen where collectionDate IS NULL', async () => {
      const study = await createTestStudy(testDb, {
        title: 'Study D',
        shortCode: 'SD',
      })
      const subject = await createTestStudySubject(testDb, {
        studyId: study.id,
        name: 'S4',
      })
      const specType = await createTestSpecimenType(testDb, { name: 'DNA' })
      const now = new Date().toISOString()
      const [inserted] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: specType.id,
          collectionDate: null,
          created: now,
          lastUpdated: now,
        })
        .returning()

      expect(
        findExistingStudySpecimen(testDb, subject.id, specType.id, null)
      ).not.toBeNull()
      expect(
        findExistingStudySpecimen(testDb, subject.id, specType.id, undefined)
      ).not.toBeNull()
      expect(
        findExistingStudySpecimen(testDb, subject.id, specType.id, '')
      ).not.toBeNull()
      const result = findExistingStudySpecimen(
        testDb,
        subject.id,
        specType.id,
        undefined
      )
      expect(result!.id).toBe(inserted!.id)
    })
  })

  describe('findExistingControlSpecimen', () => {
    it('returns null when no specimen matches', async () => {
      const def = await createTestControlDefinition(testDb, { name: 'Neg', controlType: 'negative' })
      const batch = await createTestControlBatch(testDb, def.id, { name: 'Batch 1' })
      const specType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const result = findExistingControlSpecimen(
        testDb,
        batch.id,
        specType.id,
        '2024-01-15'
      )
      expect(result).toBeNull()
    })

    it('returns specimen when matching by batch, type, and date', async () => {
      const def = await createTestControlDefinition(testDb, { name: 'Pos', controlType: 'plasma_positive' })
      const batch = await createTestControlBatch(testDb, def.id, { name: 'Batch 2' })
      const specType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const now = new Date().toISOString()
      const [inserted] = await testDb
        .insert(specimen)
        .values({
          controlBatchId: batch.id,
          specimenTypeId: specType.id,
          collectionDate: '2024-02-01',
          created: now,
          lastUpdated: now,
        })
        .returning()

      const result = findExistingControlSpecimen(
        testDb,
        batch.id,
        specType.id,
        '2024-02-01'
      )
      expect(result).not.toBeNull()
      expect(result!.id).toBe(inserted!.id)
    })

    it('matches null/empty collectionDate with specimen where collectionDate IS NULL', async () => {
      const def = await createTestControlDefinition(testDb, { name: 'Blood', controlType: 'blood' })
      const batch = await createTestControlBatch(testDb, def.id, { name: 'Batch 3' })
      const specType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const now = new Date().toISOString()
      const [inserted] = await testDb
        .insert(specimen)
        .values({
          controlBatchId: batch.id,
          specimenTypeId: specType.id,
          collectionDate: null,
          created: now,
          lastUpdated: now,
        })
        .returning()

      expect(
        findExistingControlSpecimen(testDb, batch.id, specType.id, null)
      ).not.toBeNull()
      expect(
        findExistingControlSpecimen(testDb, batch.id, specType.id, undefined)
      ).not.toBeNull()
      const result = findExistingControlSpecimen(
        testDb,
        batch.id,
        specType.id,
        ''
      )
      expect(result!.id).toBe(inserted!.id)
    })
  })
})
