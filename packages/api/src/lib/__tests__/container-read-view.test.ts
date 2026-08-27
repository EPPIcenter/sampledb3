import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestUnit,
  createTestTag,
} from '../../__tests__/helpers/factories'
import { micronixTube, storageContainer, storageContainerTag } from '../../db/schema'
import { utcNow } from '../datetime'
import { loadContainerReadViews, loadContainerReadViewsByIds } from '../container-read-view'

describe('Container read view', () => {
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

  it('assembles placement, Tags, Specimen summary, and Source in one view', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Read View Study',
      shortCode: 'RVS1',
      leadPerson: 'Dr. Read',
    })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'RV-001' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
    const unit = await createTestUnit(testDb, { symbol: 'uL-rv', name: 'microliter', category: 'volume' })
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Slot RV',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
      path: 'Freezer/Slot RV',
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'RV-Plate', locationId: loc.id })
    const now = utcNow()
    const [container] = await testDb
      .insert(storageContainer)
      .values({
        specimenId: spec.id,
        unitId: unit.id,
        totalQuantity: 1,
        remainingQuantity: 1,
        created: now,
        lastUpdated: now,
      })
      .returning()
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'RV-MT-1',
      position: 'A01',
    })
    const tag = await createTestTag(testDb, { name: 'priority' })
    await testDb.insert(storageContainerTag).values({
      storageContainerId: container.id,
      tagId: tag.id,
    })

    const [view] = await loadContainerReadViews(testDb, [container])

    expect(view.containerType).toBe('micronix_tube')
    expect(view.collection?.name).toBe('RV-Plate')
    expect(view.micronixTube?.barcode).toBe('RV-MT-1')
    expect(view.tags.map((t) => t.name)).toEqual(['priority'])
    expect(view.specimen?.id).toBe(spec.id)
    expect(view.specimen?.specimenType?.name).toBe('Whole Blood')
    expect(view.source).toMatchObject({
      type: 'subject',
      name: 'RV-001',
      study: { code: 'RVS1', title: 'Read View Study' },
    })
  })

  it('omits missing ids from the map form', async () => {
    const views = await loadContainerReadViewsByIds(testDb, [99999])
    expect(views.size).toBe(0)
  })
})
