import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { setupPaginationSettings } from '../../../__tests__/helpers/auth-helpers'
import {
  createTestSpecimen,
  createTestSpecimenType,
  createTestStudy,
  createTestStudySubject,
} from '../../../__tests__/helpers/factories'
import { listSpecimens } from '../specimen-read'

describe('specimen-read', () => {
  let testDb: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
    await setupPaginationSettings(testDb)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('listSpecimens', () => {
    it('returns all specimens when no pagination params provided', async () => {
      const study = await createTestStudy(testDb, { title: 'List Study', shortCode: 'LST01' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj 1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })

      const result = await listSpecimens(testDb, {})
      expect(result.specimens.length).toBeGreaterThanOrEqual(1)
      expect(result.pagination).toBeUndefined()
    })

    it('filters specimens by study short code', async () => {
      const studyA = await createTestStudy(testDb, { title: 'Study A', shortCode: 'STYA' })
      const studyB = await createTestStudy(testDb, { title: 'Study B', shortCode: 'STYB' })
      const subjectA = await createTestStudySubject(testDb, { studyId: studyA.id, name: 'Subj A' })
      const subjectB = await createTestStudySubject(testDb, { studyId: studyB.id, name: 'Subj B' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Serum' })
      await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectA.id })
      await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectB.id })

      const result = await listSpecimens(testDb, { study: 'STYA' })
      expect(result.specimens.every((s) => s.study?.shortCode === 'STYA')).toBe(true)
    })

    it('returns empty result with default pagination for unknown barcode', async () => {
      const result = await listSpecimens(testDb, { barcode: 'NONEXISTENT-BARCODE' })
      expect(result.specimens).toEqual([])
      expect(result.pagination).toEqual({ page: 1, limit: 50, total: 0, totalPages: 0 })
    })
  })
})
