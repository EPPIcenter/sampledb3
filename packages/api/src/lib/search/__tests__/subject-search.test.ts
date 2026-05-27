import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
} from '../../../__tests__/helpers/factories'
import { searchSubjects } from '../subject-search'

describe('subject-search', () => {
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

  it('finds subjects by name', async () => {
    const studyRecord = await createTestStudy(testDb, { title: 'Cohort', shortCode: 'COH' })
    const subject = await createTestStudySubject(testDb, {
      studyId: studyRecord.id,
      name: 'Participant-007',
    })

    const results = await searchSubjects(testDb, 'Participant')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'subject',
      id: subject.id,
      title: 'Participant-007',
      subtitle: 'Study: COH',
      url: `/subjects/${subject.id}`,
    })
  })
})
