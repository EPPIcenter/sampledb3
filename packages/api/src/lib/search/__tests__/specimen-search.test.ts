import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestSpecimen,
  createTestSpecimenType,
  createTestStudy,
  createTestStudySubject,
} from '../../../__tests__/helpers/factories'
import { searchSpecimens } from '../specimen-search'

describe('specimen-search', () => {
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

  it('finds specimens by numeric id', async () => {
    const studyRecord = await createTestStudy(testDb, { title: 'Spec Study', shortCode: 'SPEC' })
    const subject = await createTestStudySubject(testDb, { studyId: studyRecord.id, name: 'S1' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id, {
      studySubjectId: subject.id,
    })

    const results = await searchSpecimens(testDb, String(specimen.id))

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'specimen',
      id: specimen.id,
      title: `Specimen #${specimen.id}`,
      subtitle: `Source: Subject #${subject.id}`,
      url: `/specimens/${specimen.id}`,
    })
  })
})
