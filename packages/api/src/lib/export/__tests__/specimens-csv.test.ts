import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestControlDefinition,
  createTestControlBatch,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { exportSpecimensCsv } from '../specimens-csv'

const csvOptions = { delimiter: ',', includeBOM: false, lineEnding: 'LF' as const }

describe('exportSpecimensCsv', () => {
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

  it('exports only specimens for the requested study', async () => {
    const studyA = await createTestStudy(testDb, { title: 'Study A', shortCode: 'STYA' })
    const studyB = await createTestStudy(testDb, { title: 'Study B', shortCode: 'STYB' })
    const subjectA = await createTestStudySubject(testDb, { studyId: studyA.id, name: 'A' })
    const subjectB = await createTestStudySubject(testDb, { studyId: studyB.id, name: 'B' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specA = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectA.id })
    await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectB.id })

    const csv = await exportSpecimensCsv(testDb, { studyCode: 'STYA' }, csvOptions)
    const lines = csv.trim().split('\n')

    expect(lines[0]).toContain('id')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(String(specA.id))
    expect(lines[1]).toContain(String(subjectA.id))
  })

  it('returns header only when study code is unknown', async () => {
    const study = await createTestStudy(testDb, { title: 'Real', shortCode: 'REAL' })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'S' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })

    const csv = await exportSpecimensCsv(testDb, { studyCode: 'NOPE' }, csvOptions)

    expect(csv.trim().split('\n')).toHaveLength(1)
  })

  it('returns header only when study has no subjects', async () => {
    await createTestStudy(testDb, { title: 'Empty', shortCode: 'EMPTY' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    await createTestSpecimen(testDb, specimenType.id)

    const csv = await exportSpecimensCsv(testDb, { studyCode: 'EMPTY' }, csvOptions)

    expect(csv.trim().split('\n')).toHaveLength(1)
  })

  it('filters by source_type subject', async () => {
    const study = await createTestStudy(testDb, { title: 'Mixed', shortCode: 'MIX' })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const subjectSpec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })

    const definition = await createTestControlDefinition(testDb, { name: 'Ctrl def' })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Ctrl batch' })
    await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })

    const csv = await exportSpecimensCsv(testDb, { sourceType: 'subject' }, csvOptions)
    const lines = csv.trim().split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(String(subjectSpec.id))
  })

  it('filters by source_type control', async () => {
    const study = await createTestStudy(testDb, { title: 'Mixed2', shortCode: 'MIX2' })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })

    const definition = await createTestControlDefinition(testDb, { name: 'Ctrl def 2' })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Ctrl batch 2' })
    const controlSpec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })

    const csv = await exportSpecimensCsv(testDb, { sourceType: 'control' }, csvOptions)
    const lines = csv.trim().split('\n')

    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(String(controlSpec.id))
  })
})
