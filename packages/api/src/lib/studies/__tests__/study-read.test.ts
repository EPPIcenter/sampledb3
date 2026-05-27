import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { setupPaginationSettings } from '../../../__tests__/helpers/auth-helpers'
import {
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStudy,
  createTestStudySubject,
} from '../../../__tests__/helpers/factories'
import { specimen } from '../../../db/schema'
import { utcNow } from '../../datetime'
import { getStudySummaries, listStudies } from '../study-read'

describe('study-read', () => {
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

  describe('listStudies', () => {
    it('returns paginated studies', async () => {
      await createTestStudy(testDb, { title: 'Alpha Study', shortCode: 'ALP01' })
      await createTestStudy(testDb, { title: 'Beta Study', shortCode: 'BET01' })

      const result = await listStudies(testDb, { page: 1, limit: 10 })
      expect(result.studies.length).toBeGreaterThanOrEqual(2)
      expect(result.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      })
    })

    it('filters studies by search term', async () => {
      await createTestStudy(testDb, { title: 'Unique Searchable Title', shortCode: 'UNQ01' })
      await createTestStudy(testDb, { title: 'Other Title', shortCode: 'OTH01' })

      const result = await listStudies(testDb, { search: 'Unique Searchable', page: 1, limit: 10 })
      expect(result.studies.some((s) => s.shortCode === 'UNQ01')).toBe(true)
      expect(result.studies.some((s) => s.shortCode === 'OTH01')).toBe(false)
    })
  })

  describe('getStudySummaries', () => {
    it('returns empty summaries for studies with no subjects', async () => {
      const study = await createTestStudy(testDb, { title: 'Empty Study', shortCode: 'EMP01' })

      const result = await getStudySummaries(testDb, sqlite, [study.id])
      expect(result.summaries).toEqual([
        {
          studyId: study.id,
          totalSubjects: 0,
          totalSpecimens: 0,
          totalContainers: 0,
          collectionDateRange: null,
        },
      ])
    })

    it('aggregates subjects, specimens, containers, and date range', async () => {
      const study = await createTestStudy(testDb, { title: 'Summary Study', shortCode: 'SUM01' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj 1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const now = utcNow()
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: specimenType.id,
          collectionDate: '2024-01-15',
          created: now,
          lastUpdated: now,
        })
        .returning()
      await createTestStorageContainer(testDb, { specimenId: spec!.id })

      const result = await getStudySummaries(testDb, sqlite, [study.id])
      expect(result.summaries).toEqual([
        {
          studyId: study.id,
          totalSubjects: 1,
          totalSpecimens: 1,
          totalContainers: 1,
          collectionDateRange: {
            earliest: '2024-01-15',
            latest: '2024-01-15',
          },
        },
      ])
    })

    it('returns empty array when ids is empty', async () => {
      const result = await getStudySummaries(testDb, sqlite, [])
      expect(result.summaries).toEqual([])
    })
  })
})
