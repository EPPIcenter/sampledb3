import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
  createTestTag,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { storageContainerTag, specimen as specimenTable } from '../../../db/schema'
import { utcNow } from '../../datetime'
import { eq } from 'drizzle-orm'
import {
  buildContainerQuery,
  buildMultiStudyContainerQuery,
  resolveMicronixBarcodesToContainers,
  buildContainerQueryByMicronixBarcodes,
} from '../query'

describe('buildContainerQuery', () => {
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

  it('returns containers and study for study with subject and specimen', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Export Study',
      shortCode: 'EX1',
      leadPerson: 'Lead',
    })
    const subject = await createTestStudySubject(testDb, {
      studyId: study.id,
      name: 'Subject1',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id, {
      studySubjectId: subject.id,
    })
    await createTestStorageContainer(testDb, { specimenId: specimen.id })

    const result = await buildContainerQuery(testDb, { study: 'EX1' })
    expect(result.study.shortCode).toBe('EX1')
    expect(result.containers).toHaveLength(1)
    expect(result.specimens).toBeDefined()
    expect(result.specimens!.length).toBe(1)
  })

  it('throws for unknown study short code', async () => {
    await expect(
      buildContainerQuery(testDb, { study: 'UNKNOWN' })
    ).rejects.toThrow('not found')
  })

  it('returns empty containers when study has no specimens', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Empty Study',
      shortCode: 'EMPTY2',
      leadPerson: 'X',
    })
    await createTestStudySubject(testDb, { studyId: study.id, name: 'S1' })
    const result = await buildContainerQuery(testDb, { study: 'EMPTY2' })
    expect(result.containers).toHaveLength(0)
    expect(result.study.shortCode).toBe('EMPTY2')
  })

  it('returns empty containers when study has no subjects', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Empty New Study',
      shortCode: 'EMPTY_NEW',
      leadPerson: 'X',
    })
    // No subjects created
    const result = await buildContainerQuery(testDb, { study: 'EMPTY_NEW' })
    expect(result.containers).toHaveLength(0)
    expect(result.study.shortCode).toBe('EMPTY_NEW')
  })

  it('returns only containers that have all selected tags (AND)', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Tag Filter Study',
      shortCode: 'TF1',
      leadPerson: 'Lead',
    })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })

    const unit = await createTestUnit(testDb, {
      symbol: `uL-tag-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const bothTagsContainer = await createTestStorageContainer(testDb, { specimenId: spec.id, unitId: unit.id })
    const oneTagContainer = await createTestStorageContainer(testDb, { specimenId: spec.id, unitId: unit.id })

    const qcTag = await createTestTag(testDb, { name: 'QC' })
    const holdTag = await createTestTag(testDb, { name: 'Hold' })

    await testDb.insert(storageContainerTag).values([
      { storageContainerId: bothTagsContainer.id, tagId: qcTag.id },
      { storageContainerId: bothTagsContainer.id, tagId: holdTag.id },
      { storageContainerId: oneTagContainer.id, tagId: qcTag.id },
    ])

    const result = await buildContainerQuery(testDb, {
      study: 'TF1',
      tag_ids: [qcTag.id, holdTag.id],
    })

    expect(result.containers).toHaveLength(1)
    expect(result.containers[0].id).toBe(bothTagsContainer.id)
  })
})

describe('buildContainerQuery for studies with more subjects than SQLite allows as bound parameters', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  const count = 70_000

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) cleanupTestDatabase(sqlite)
  })

  /** 70,000 subjects; the first three have one dated specimen and container each. */
  async function seedBigStudy() {
    const study = await createTestStudy(testDb, { title: 'Big Study', shortCode: 'BIG' })
    const type = await createTestSpecimenType(testDb, { name: 'DBS' })
    const subjectIds: number[] = []
    sqlite.exec('BEGIN')
    const addSubject = sqlite.prepare(
      "INSERT INTO study_subject (study_id, name, created, last_updated) VALUES (?, ?, '2024-01-01', '2024-01-01')",
    )
    for (let i = 0; i < count; i++) {
      subjectIds.push(Number(addSubject.run(study.id, `S${i}`).lastInsertRowid))
    }
    sqlite.exec('COMMIT')
    const unit = await createTestUnit(testDb, { symbol: 'spots', name: 'spots', category: 'count' })
    for (const [i, subjectId] of subjectIds.slice(0, 3).entries()) {
      const spec = await createTestSpecimen(testDb, type.id, { studySubjectId: subjectId })
      await testDb.update(specimenTable).set({ collectionDate: `2024-0${i + 1}-01` }).where(eq(specimenTable.id, spec.id))
      await createTestStorageContainer(testDb, { specimenId: spec.id, unitId: unit.id })
    }
    return subjectIds
  }

  it('exports the whole study', async () => {
    await seedBigStudy()

    const result = await buildContainerQuery(testDb, { study: 'BIG' })

    expect(result.containers).toHaveLength(3)
  }, 60_000)

  it('exports a listed subject set with per-subject dates', async () => {
    const subjectIds = await seedBigStudy()

    const result = await buildContainerQuery(testDb, {
      study: 'BIG',
      subject_ids: subjectIds,
      subject_dates: { [subjectIds[0]]: [{ exact: '2024-01-01' }], [subjectIds[1]]: [{ exact: '2030-01-01' }] },
    })

    // Subject 0 matches its date, subject 1 does not, subject 2 is listed without a date.
    expect(result.specimens?.map((s) => s.studySubjectId).sort((a, b) => a! - b!)).toEqual([subjectIds[0], subjectIds[2]])
  }, 60_000)
})

describe('resolveMicronixBarcodesToContainers', () => {
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

  it('returns empty map for empty barcodes', async () => {
    const result = await resolveMicronixBarcodesToContainers(testDb, [])
    expect(result.size).toBe(0)
  })

  it('returns empty map for non-existent barcodes', async () => {
    const result = await resolveMicronixBarcodesToContainers(testDb, ['BAR1', 'BAR2'])
    expect(result.size).toBe(0)
  })

  it('filters out blank barcodes', async () => {
    const result = await resolveMicronixBarcodesToContainers(testDb, ['  ', ''])
    expect(result.size).toBe(0)
  })
})

describe('buildContainerQueryByMicronixBarcodes', () => {
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

  it('returns empty result for empty container ids', async () => {
    const result = await buildContainerQueryByMicronixBarcodes(testDb, [])
    expect(result.containers).toHaveLength(0)
    expect(result.specimens).toHaveLength(0)
    expect(result.studies).toHaveLength(0)
    expect(result.subjectToStudyMap.size).toBe(0)
  })
})


describe('buildMultiStudyContainerQuery subject dates', () => {
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

  it('keeps every listed visit per subject and includes subjects listed without a date', async () => {
    const study = await createTestStudy(testDb, { title: 'Visits', shortCode: 'VIS', leadPerson: 'L' })
    const s01 = await createTestStudySubject(testDb, { studyId: study.id, name: 'S01' })
    const s02 = await createTestStudySubject(testDb, { studyId: study.id, name: 'S02' })
    const type = await createTestSpecimenType(testDb, { name: 'Blood' })
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const now = utcNow()
    const addSpecimen = async (subjectId: number, collectionDate: string) => {
      const [row] = await testDb
        .insert(specimenTable)
        .values({ studySubjectId: subjectId, specimenTypeId: type.id, collectionDate, created: now, lastUpdated: now })
        .returning()
      await createTestStorageContainer(testDb, { specimenId: row.id, unitId: unit.id })
      return row
    }
    const jan = await addSpecimen(s01.id, '2024-01-01')
    const feb = await addSpecimen(s01.id, '2024-02-01')
    await addSpecimen(s01.id, '2024-03-01')
    const may = await addSpecimen(s02.id, '2024-05-05')

    const result = await buildMultiStudyContainerQuery(
      testDb,
      [
        { study_short_code: 'VIS', subject_name: 'S01', collection_date: '2024-01-01' },
        { study_short_code: 'VIS', subject_name: 'S01', collection_date: '2024-02-01' },
        { study_short_code: 'VIS', subject_name: 'S02' },
      ],
      {},
    )

    expect(result.containers.map((c) => c.specimen_id).sort((a, b) => a - b)).toEqual(
      [jan.id, feb.id, may.id].sort((a, b) => a - b),
    )
  })
})
