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
  createTestStorageType,
  createTestLocation,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestStorageContainer,
  createTestUnit,
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

    it('filters by barcode to every Specimen with a Container carrying it', async () => {
      const study = await createTestStudy(testDb, { title: 'NA Study', shortCode: 'NAS' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj NA' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Freezer 1', storageTypeId: String(storageType.id) })
      const cryoBox = await createTestCryovialBox(testDb, { name: 'BOX-NA', locationId: location.id })
      const specimens = []
      for (const [index, date] of ['2024-01-01', '2024-02-01', '2024-03-01'].entries()) {
        const s = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id, collectionDate: date })
        specimens.push(s)
        const container = await createTestStorageContainer(testDb, { specimenId: s.id, unitId: unit.id })
        await createTestCryovialTube(testDb, {
          containerId: container.id,
          collectionId: cryoBox.id,
          barcode: index < 2 ? 'NA' : 'OTHER',
          position: `A0${index + 1}`,
        })
      }

      const result = await listSpecimens(testDb, { barcode: 'NA' })

      expect(result.specimens.map((s) => s.id).sort((a, b) => a - b)).toEqual([specimens[0].id, specimens[1].id])
    })

    it('returns empty result with default pagination for unknown barcode', async () => {
      const result = await listSpecimens(testDb, { barcode: 'NONEXISTENT-BARCODE' })
      expect(result.specimens).toEqual([])
      expect(result.pagination).toEqual({ page: 1, limit: 50, total: 0, totalPages: 0 })
    })
  })
})
