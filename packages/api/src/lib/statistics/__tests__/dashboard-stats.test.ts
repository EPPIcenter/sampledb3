import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestStorageContainer,
  createTestStorageType,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStudy,
  createTestStudySubject,
  createTestTag,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { utcNow } from '../../datetime'
import { eq } from 'drizzle-orm'
import { micronixTube, specimen, storageContainerTag } from '../../../db/schema'
import { getDashboardStatistics } from '../dashboard-stats'

describe('dashboard-stats', () => {
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

  it('returns expected shape on empty database', async () => {
    const data = await getDashboardStatistics(testDb, {})

    expect(data.specimens).toMatchObject({
      total: 0,
      bySourceType: {},
      bySpecimenType: {},
      byStudy: {},
      collectionTimeline: [],
      creationTimeline: [],
    })
    expect(data.containers).toMatchObject({
      total: 0,
      byType: {},
      byStatus: {},
      averagePerSpecimen: 0,
    })
    expect(data.storage.byLocation).toEqual([])
    expect(data.storage.byRootLocation).toEqual({})
    expect(data.storage._summary).toBeUndefined()
  })

  it('returns empty results for unknown study short code', async () => {
    const data = await getDashboardStatistics(testDb, {
      study: 'NONEXISTENT',
    })

    expect(data.specimens.total).toBe(0)
    expect(data.containers.total).toBe(0)
    expect(data.storage.byLocation).toEqual([])
    expect(data.storage._summary).toBeUndefined()
  })

  it('does not report whole-database totals for an unknown study', async () => {
    const type = await createTestSpecimenType(testDb, { name: 'Blood' })
    await createTestSpecimen(testDb, type.id)

    const all = await getDashboardStatistics(testDb, {})
    const unknown = await getDashboardStatistics(testDb, { study: 'NONEXISTENT' })

    expect(all.specimens.total).toBe(1)
    expect(unknown.specimens.total).toBe(0)
  })

  it('includes records created on the created_to date', async () => {
    const type = await createTestSpecimenType(testDb, { name: 'Blood' })
    await createTestSpecimen(testDb, type.id)
    const today = utcNow().slice(0, 10)

    const data = await getDashboardStatistics(testDb, { created_to: today })

    expect(data.specimens.total).toBe(1)
  })

  it('filters created_from and created_to on when the Specimen was created', async () => {
    const type = await createTestSpecimenType(testDb, { name: 'Blood' })
    const older = await createTestSpecimen(testDb, type.id)
    await createTestStorageContainer(testDb, { specimenId: older.id })
    await testDb.update(specimen).set({ created: '2020-06-01T00:00:00.000Z' }).where(eq(specimen.id, older.id))
    await createTestSpecimen(testDb, type.id)

    const data = await getDashboardStatistics(testDb, { created_from: '2020-01-01', created_to: '2020-12-31' })

    expect(data.specimens.total).toBe(1)
    expect(data.containers.total).toBe(1)
  })

  it('counts only Specimens with a Container carrying every selected Tag', async () => {
    const type = await createTestSpecimenType(testDb, { name: 'Blood' })
    const red = await createTestTag(testDb, { name: 'red' })
    const blue = await createTestTag(testDb, { name: 'blue' })
    const unitId = (await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })).id
    const both = await createTestStorageContainer(testDb, { specimenId: (await createTestSpecimen(testDb, type.id)).id, unitId })
    const redOnly = await createTestStorageContainer(testDb, { specimenId: (await createTestSpecimen(testDb, type.id)).id, unitId })
    await testDb.insert(storageContainerTag).values([
      { storageContainerId: both.id, tagId: red.id },
      { storageContainerId: both.id, tagId: blue.id },
      { storageContainerId: redOnly.id, tagId: red.id },
    ])

    const data = await getDashboardStatistics(testDb, { tag_ids: [red.id, blue.id] })

    expect(data.specimens.total).toBe(1)
    expect(data.containers.total).toBe(1)
    expect(data.containers.averagePerSpecimen).toBe(1)
  })

  it('matches nothing for control Specimens within a Study', async () => {
    const study = await createTestStudy(testDb, { title: 'Study', shortCode: 'ST' })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'S1' })
    const type = await createTestSpecimenType(testDb, { name: 'Blood' })
    await createTestSpecimen(testDb, type.id, { studySubjectId: subject.id })

    const subjects = await getDashboardStatistics(testDb, { study: 'ST', source_type: 'subject' })
    const controls = await getDashboardStatistics(testDb, { study: 'ST', source_type: 'control' })

    expect(subjects.specimens.total).toBe(1)
    expect(controls.specimens.total).toBe(0)
  })

  it('includes containers at a filtered location', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Stats Storage' })
    const loc = await createTestLocation(testDb, {
      name: 'Stats Freezer',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Stats Plate', locationId: loc.id })
    const container = await createTestStorageContainer(testDb)
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-STATS-1',
      position: 'B01',
    })

    const data = await getDashboardStatistics(testDb, {
      location_id: loc.id,
    })

    expect(data.containers.total).toBe(1)
    expect(data.containers.byType.micronix_tube).toBe(1)
  })

  it('returns byStatus for containers with remaining quantity', async () => {
    const container = await createTestStorageContainer(testDb)

    const data = await getDashboardStatistics(testDb, {})

    expect(data.containers.byStatus['In Use']).toBe(1)
    expect(data.containers.total).toBe(1)
  })

  it('filters by a study with more subjects than SQLite allows as bound parameters', async () => {
    const study = await createTestStudy(testDb, { title: 'Big Study', shortCode: 'BIG' })
    const type = await createTestSpecimenType(testDb, { name: 'DBS' })
    sqlite.exec('BEGIN')
    const addSubject = sqlite.prepare(
      "INSERT INTO study_subject (study_id, name, created, last_updated) VALUES (?, ?, '2024-01-01', '2024-01-01')",
    )
    const subjectIds: number[] = []
    for (let i = 0; i < 70_000; i++) {
      subjectIds.push(Number(addSubject.run(study.id, `S${i}`).lastInsertRowid))
    }
    sqlite.exec('COMMIT')
    for (const subjectId of subjectIds.slice(0, 3)) {
      await createTestSpecimen(testDb, type.id, { studySubjectId: subjectId })
    }
    await createTestSpecimen(testDb, type.id) // in another study

    const data = await getDashboardStatistics(testDb, { study: 'BIG' })

    expect(data.specimens.total).toBe(3)
    expect(data.specimens.byStudy).toEqual({ BIG: 3 })
  }, 60_000)
})
