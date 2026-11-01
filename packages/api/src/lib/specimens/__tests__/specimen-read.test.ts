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
import { specimen } from '../../../db/schema'
import { ValidationError } from '../../error-handler'
import { eq } from 'drizzle-orm'

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
    it('returns the first page at the default page size, with the total, when no page or limit is given', async () => {
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const study = await createTestStudy(testDb, { title: 'List Study', shortCode: 'LST01' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj 1' })
      for (let day = 1; day <= 30; day++) {
        await createTestSpecimen(testDb, specimenType.id, {
          studySubjectId: subject.id,
          collectionDate: `2024-01-${String(day).padStart(2, '0')}`,
        })
      }

      const result = await listSpecimens(testDb, {})

      // setupPaginationSettings: defaultPageSize 25
      expect(result.specimens).toHaveLength(25)
      expect(result.pagination).toEqual({ page: 1, limit: 25, total: 30, totalPages: 2 })
    })

    it('returns the requested page, and the pages together hold every specimen once', async () => {
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const study = await createTestStudy(testDb, { title: 'Page Study', shortCode: 'PG01' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj 1' })
      const created = '2024-06-01 00:00:00'
      const ids: number[] = []
      for (let day = 1; day <= 7; day++) {
        // Equal created timestamps: the id tie-break keeps page boundaries stable.
        const s = await createTestSpecimen(testDb, specimenType.id, {
          studySubjectId: subject.id,
          collectionDate: `2024-01-0${day}`,
          created,
        })
        ids.push(s.id)
      }

      const pages = await Promise.all([1, 2, 3].map((page) => listSpecimens(testDb, { page: String(page), limit: '3' })))

      expect(pages.map((p) => p.specimens.length)).toEqual([3, 3, 1])
      expect(pages[2].pagination).toEqual({ page: 3, limit: 3, total: 7, totalPages: 3 })
      expect(pages.flatMap((p) => p.specimens.map((s) => s.id))).toEqual([...ids].reverse())
    })

    it('sorts by collection date across pages, with undated specimens last in either direction', async () => {
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const study = await createTestStudy(testDb, { title: 'Sort Study', shortCode: 'SRT01' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj 1' })
      const otherSubject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj 2' })
      for (const date of ['2024-03-01', '2023-01-15', '2024-12-31', '2022-07-04']) {
        await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id, collectionDate: date })
      }
      const undated = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: otherSubject.id })
      await testDb.update(specimen).set({ collectionDate: null }).where(eq(specimen.id, undated.id))

      const collect = async (order: string) => {
        const dates: Array<string | null> = []
        for (const page of ['1', '2', '3']) {
          const result = await listSpecimens(testDb, { sort: 'collection_date', order, page, limit: '2' })
          dates.push(...result.specimens.map((s) => s.collectionDate))
        }
        return dates
      }

      expect(await collect('asc')).toEqual(['2022-07-04', '2023-01-15', '2024-03-01', '2024-12-31', null])
      expect(await collect('desc')).toEqual(['2024-12-31', '2024-03-01', '2023-01-15', '2022-07-04', null])
    })

    it('sorts by created, oldest first with order=asc', async () => {
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const study = await createTestStudy(testDb, { title: 'Created Study', shortCode: 'CRT01' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj 1' })
      for (const [day, created] of ['2024-05-02 08:00:00', '2024-05-01 08:00:00', '2024-05-03 08:00:00'].entries()) {
        await createTestSpecimen(testDb, specimenType.id, {
          studySubjectId: subject.id,
          collectionDate: `2024-01-0${day + 1}`,
          created,
        })
      }

      const asc = await listSpecimens(testDb, { sort: 'created', order: 'asc' })
      const byDefault = await listSpecimens(testDb, {})

      expect(asc.specimens.map((s) => s.created)).toEqual(['2024-05-01 08:00:00', '2024-05-02 08:00:00', '2024-05-03 08:00:00'])
      expect(byDefault.specimens.map((s) => s.created)).toEqual(['2024-05-03 08:00:00', '2024-05-02 08:00:00', '2024-05-01 08:00:00'])
    })

    it.each([
      [{ sort: 'study' }, "Invalid sort 'study'"],
      [{ sort: 'created; DROP TABLE specimen' }, 'Invalid sort'],
      [{ sort: 'created', order: 'sideways' }, "Invalid order 'sideways'"],
    ])('rejects %j with a ValidationError', async (params, message) => {
      await expect(listSpecimens(testDb, params)).rejects.toThrow(ValidationError)
      await expect(listSpecimens(testDb, params)).rejects.toThrow(message)
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
      expect(result.pagination).toEqual({ page: 1, limit: 25, total: 0, totalPages: 0 })
    })
  })
})
