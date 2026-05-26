import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestStudy, createTestStudySubject, createTestSpecimenType } from '../../__tests__/helpers/factories'
import { mergeSubjects, validateSubjectsForMerge } from '../subjects/merge'
import { studySubject, specimen } from '../../db/schema'
import type { Database } from '../../db/client'

describe('subjects merge', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) cleanupTestDatabase(sqlite)
  })

  it('rejects merge across different studies', async () => {
    const studyA = await createTestStudy(testDb, { title: 'Study A', shortCode: 'MRG-A' })
    const studyB = await createTestStudy(testDb, { title: 'Study B', shortCode: 'MRG-B' })
    const target = await createTestStudySubject(testDb, { studyId: studyA.id, name: 'T' })
    const source = await createTestStudySubject(testDb, { studyId: studyB.id, name: 'S' })
    const result = await validateSubjectsForMerge(testDb, target.id, source.id)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('same study')
  })

  it('transfers specimens and deletes source subject', async () => {
    const study = await createTestStudy(testDb, { title: 'Merge Study', shortCode: 'MRG-1' })
    const type = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
    const target = await createTestStudySubject(testDb, { studyId: study.id, name: 'TARGET' })
    const source = await createTestStudySubject(testDb, { studyId: study.id, name: 'SOURCE' })
    const now = new Date().toISOString()
    await testDb.insert(specimen).values({
      studySubjectId: source.id,
      specimenTypeId: type.id,
      created: now,
      lastUpdated: now,
    })

    const result = await mergeSubjects(testDb, target.id, source.id, undefined)
    expect(result.specimensTransferred).toBe(1)
    expect(result.targetSubject.id).toBe(target.id)

    const remaining = await testDb.select().from(studySubject).where(eq(studySubject.id, source.id)).get()
    expect(remaining).toBeUndefined()
  })
})
