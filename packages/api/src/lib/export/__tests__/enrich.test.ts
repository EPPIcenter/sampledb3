import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestUnit,
  createTestStrain,
  createTestControlDefinition,
  createTestControlBatch,
  createTestTag,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { micronixTube, cryovialTube, cryovialBox, storageContainerTag, box, sheet, paper } from '../../../db/schema'
import { utcNow } from '../../datetime'
import { utcNow } from '../../datetime'
import { enrichContainerData } from '../enrich'
import { buildContainerQuery } from '../query'
import type { StudyRecord } from '../types'

describe('enrichContainerData', () => {
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

  async function createMicronixContainer(
    db: Database,
    specimenId: number,
    plate: { id: number; name: string },
    barcode: string,
    position: string,
  ) {
    const unit = await createTestUnit(db, {
      symbol: `uL-${Date.now()}-${Math.random()}`,
      name: 'microliter',
      category: 'volume',
    })
    const container = await createTestStorageContainer(db, { specimenId, unitId: unit.id })
    await db.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode,
      position,
    })
    return container
  }

  it('enriches study subject containers with placement and study fields', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Enrich Study',
      shortCode: 'ENR1',
      leadPerson: 'Lead One',
    })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj-A' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Slot A',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
      path: 'Freezer/Slot A',
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate-1', locationId: loc.id })
    const container = await createMicronixContainer(testDb, spec.id, plate, 'MT-001', 'A01')

    const enriched = await enrichContainerData(
      testDb,
      [container],
      [
        {
          id: spec.id,
          studySubjectId: subject.id,
          controlBatchId: null,
          specimenTypeId: specimenType.id,
          collectionDate: '2024-06-01',
          created: spec.created,
        },
      ],
      study as StudyRecord,
    )

    expect(enriched).toHaveLength(1)
    expect(enriched[0]).toMatchObject({
      container_id: container.id,
      container_type: 'micronix_tube',
      barcode: 'MT-001',
      position: 'A01',
      collection_name: 'Plate-1',
      specimen_type: 'Blood',
      subject_id: subject.id,
      subject_name: 'Subj-A',
      study_code: 'ENR1',
      study_title: 'Enrich Study',
      study_lead_person: 'Lead One',
    })
    expect(enriched[0].location_path).toContain('Freezer')
  })

  it('enriches control batch containers with definition and strain composition', async () => {
    const strain = await createTestStrain(testDb, { name: 'W2' })
    const definition = await createTestControlDefinition(testDb, {
      name: 'Blood mix',
      controlType: 'blood',
      properties: {
        strains: [{ id: strain.id, name: 'W2', percentage: 100 }],
        targetDensity: 10000,
        targetDensityUnitSymbol: 'p/uL',
      },
    })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch-June' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Control blood' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const placeholderStudy = await createTestStudy(testDb, {
      title: 'Unused',
      shortCode: 'UNUSED',
    })
    const unit = await createTestUnit(testDb, {
      symbol: `uL-ctrl-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const container = await createTestStorageContainer(testDb, { specimenId: spec.id, unitId: unit.id })

    const enriched = await enrichContainerData(
      testDb,
      [container],
      [
        {
          id: spec.id,
          studySubjectId: null,
          controlBatchId: batch.id,
          specimenTypeId: specimenType.id,
          collectionDate: null,
          created: spec.created,
        },
      ],
      placeholderStudy as StudyRecord,
    )

    expect(enriched).toHaveLength(1)
    expect(enriched[0]).toMatchObject({
      container_id: container.id,
      control_batch_id: batch.id,
      control_batch_name: 'Batch-June',
      control_definition_name: 'Blood mix',
      control_type: 'blood',
      subject_name: 'Batch-June',
      target_density: 10000,
      target_density_unit: 'p/uL',
      study_code: undefined,
      study_title: undefined,
    })
    expect(enriched[0].strain_composition).toContain('W2')
    expect(enriched[0].strain_composition).toContain('100%')
  })

  it('filters out container types not in container_types', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Filter Study',
      shortCode: 'FILT',
    })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Serum' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
    const storageType = await createTestStorageType(testDb, { name: 'Shelf' })
    const loc = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'P-mic', locationId: loc.id })
    const micronix = await createMicronixContainer(testDb, spec.id, plate, 'MIC-1', 'A01')

    const unit = await createTestUnit(testDb, {
      symbol: `uL-cv-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const cryoContainer = await createTestStorageContainer(testDb, { specimenId: spec.id, unitId: unit.id })
    const now = utcNow()
    const [box] = await testDb
      .insert(cryovialBox)
      .values({ name: 'CryoBox', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    await testDb.insert(cryovialTube).values({
      id: cryoContainer.id,
      collectionId: box!.id,
      barcode: 'CRYO-1',
      position: null,
    })

    const specimenRow = {
      id: spec.id,
      studySubjectId: subject.id,
      controlBatchId: null,
      specimenTypeId: specimenType.id,
      collectionDate: null,
      created: spec.created,
    }

    const enriched = await enrichContainerData(
      testDb,
      [micronix, cryoContainer],
      [specimenRow],
      study as StudyRecord,
      ['micronix_tube'],
    )

    expect(enriched).toHaveLength(1)
    expect(enriched[0].container_type).toBe('micronix_tube')
    expect(enriched[0].container_id).toBe(micronix.id)
  })

  it('uses subjectToStudyMap for per-subject study fields in multi-study export', async () => {
    const studyA = await createTestStudy(testDb, {
      title: 'Study Alpha',
      shortCode: 'ALPHA',
      leadPerson: 'Alpha Lead',
    })
    const studyB = await createTestStudy(testDb, {
      title: 'Study Beta',
      shortCode: 'BETA',
      leadPerson: 'Beta Lead',
    })
    const subjectA = await createTestStudySubject(testDb, { studyId: studyA.id, name: 'A1' })
    const subjectB = await createTestStudySubject(testDb, { studyId: studyB.id, name: 'B1' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
    const specA = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectA.id })
    const specB = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectB.id })
    const unit = await createTestUnit(testDb, {
      symbol: `uL-ms-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const containerA = await createTestStorageContainer(testDb, { specimenId: specA.id, unitId: unit.id })
    const containerB = await createTestStorageContainer(testDb, { specimenId: specB.id, unitId: unit.id })

    const subjectToStudyMap = new Map<number, StudyRecord>([
      [subjectA.id, studyA as StudyRecord],
      [subjectB.id, studyB as StudyRecord],
    ])

    const enriched = await enrichContainerData(
      testDb,
      [containerA, containerB],
      [
        {
          id: specA.id,
          studySubjectId: subjectA.id,
          controlBatchId: null,
          specimenTypeId: specimenType.id,
          collectionDate: null,
          created: specA.created,
        },
        {
          id: specB.id,
          studySubjectId: subjectB.id,
          controlBatchId: null,
          specimenTypeId: specimenType.id,
          collectionDate: null,
          created: specB.created,
        },
      ],
      studyA as StudyRecord,
      undefined,
      subjectToStudyMap,
    )

    expect(enriched).toHaveLength(2)
    const rowA = enriched.find((r) => r.subject_name === 'A1')
    const rowB = enriched.find((r) => r.subject_name === 'B1')
    expect(rowA?.study_code).toBe('ALPHA')
    expect(rowB?.study_code).toBe('BETA')
  })

  describe('pipeline with buildContainerQuery', () => {
    it('enriches containers returned from buildContainerQuery', async () => {
      const study = await createTestStudy(testDb, {
        title: 'Pipeline Study',
        shortCode: 'PIPE',
        leadPerson: 'Pipe Lead',
      })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'PipeSubj' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Whole blood' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      const storageType = await createTestStorageType(testDb, { name: 'Cold' })
      const loc = await createTestLocation(testDb, {
        name: 'Rack 1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'PipePlate', locationId: loc.id })
      await createMicronixContainer(testDb, spec.id, plate, 'PIPE-01', 'B02')

      const { study: resolvedStudy, containers, specimens } = await buildContainerQuery(testDb, {
        study: 'PIPE',
      })
      const enriched = await enrichContainerData(
        testDb,
        containers,
        specimens!,
        resolvedStudy,
      )

      expect(enriched).toHaveLength(1)
      expect(enriched[0]).toMatchObject({
        subject_name: 'PipeSubj',
        study_code: 'PIPE',
        specimen_type: 'Whole blood',
        barcode: 'PIPE-01',
      })
    })
  })

  it('enriches paper containers with sublabel and sheet_name, not barcode', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Paper Export Study',
      shortCode: 'PPR1',
      leadPerson: 'Lead',
    })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'PaperSubj' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'DBS' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Paper Shelf',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
      path: 'Freezer/Paper Shelf',
    })
    const now = utcNow()
    const [parentBox] = await testDb
      .insert(box)
      .values({ name: 'DBS-Box', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    const [parentSheet] = await testDb
      .insert(sheet)
      .values({ name: 'Sheet-Alpha', boxId: parentBox!.id, created: now, lastUpdated: now })
      .returning()
    const container = await createTestStorageContainer(testDb, { specimenId: spec.id })
    await testDb.insert(paper).values({
      id: container.id,
      sheetId: parentSheet!.id,
      sublabel: 'Spot-7',
    })

    const enriched = await enrichContainerData(
      testDb,
      [container],
      [
        {
          id: spec.id,
          studySubjectId: subject.id,
          controlBatchId: null,
          specimenTypeId: specimenType.id,
          collectionDate: '2024-06-01',
          created: spec.created,
        },
      ],
      study as StudyRecord,
    )

    expect(enriched).toHaveLength(1)
    expect(enriched[0]).toMatchObject({
      container_type: 'paper',
      sublabel: 'Spot-7',
      sheet_name: 'Sheet-Alpha',
      collection_name: 'Sheet-Alpha',
    })
    expect(enriched[0].barcode).toBeUndefined()
  })

  it('includes sorted comma-separated tag names on export rows', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Tag Study',
      shortCode: 'TAGS',
      leadPerson: 'Lead',
    })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'TaggedSubj' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
    const container = await createTestStorageContainer(testDb, { specimenId: spec.id })

    const holdTag = await createTestTag(testDb, { name: 'Hold' })
    const qcTag = await createTestTag(testDb, { name: 'QC' })
    await testDb.insert(storageContainerTag).values([
      { storageContainerId: container.id, tagId: holdTag.id },
      { storageContainerId: container.id, tagId: qcTag.id },
    ])

    const enriched = await enrichContainerData(
      testDb,
      [container],
      [
        {
          id: spec.id,
          studySubjectId: subject.id,
          controlBatchId: null,
          specimenTypeId: specimenType.id,
          collectionDate: null,
          created: spec.created,
        },
      ],
      study,
    )

    expect(enriched).toHaveLength(1)
    expect(enriched[0].tags).toBe('Hold, QC')
    expect('state' in enriched[0]).toBe(false)
  })
})
