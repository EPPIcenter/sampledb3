import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestSpecimen,
  createTestSpecimenType,
  createTestStudy,
  createTestStudySubject,
} from '../../../__tests__/helpers/factories'
import { computeSpecimenAggregates } from '../specimen-aggregates'

describe('specimen-aggregates', () => {
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

  it('returns empty aggregates for no specimens', async () => {
    const result = await computeSpecimenAggregates(testDb, [], {
      subjectIds: [],
    })

    expect(result).toEqual({
      total: 0,
      bySourceType: {},
      bySpecimenType: {},
      byStudy: {},
      collectionTimeline: [],
      creationTimeline: [],
    })
  })

  it('counts specimens by study short code', async () => {
    const studyRecord = await createTestStudy(testDb, {
      title: 'Study A',
      shortCode: 'STUDYA',
    })
    const subject = await createTestStudySubject(testDb, {
      studyId: studyRecord.id,
      name: 'Subject 1',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id, {
      studySubjectId: subject.id,
    })

    const result = await computeSpecimenAggregates(testDb, [specimen], {
      subjectIds: [],
    })

    expect(result.total).toBe(1)
    expect(result.bySourceType.subject).toBe(1)
    expect(result.bySpecimenType.Blood).toBe(1)
    expect(result.byStudy.STUDYA).toBe(1)
  })
})
