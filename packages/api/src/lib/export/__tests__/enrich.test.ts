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
import { micronixTube, storageContainerTag, box, sheet, paper } from '../../../db/schema'
import { utcNow } from '../../datetime'
import { enrichContainerData } from '../enrich'

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

    const enriched = await enrichContainerData(testDb, [container])

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
    const unit = await createTestUnit(testDb, {
      symbol: `uL-ctrl-${Date.now()}`,
      name: 'microliter',
      category: 'volume',
    })
    const container = await createTestStorageContainer(testDb, { specimenId: spec.id, unitId: unit.id })

    const enriched = await enrichContainerData(testDb, [container])

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

  it("takes each row's study fields from its Source's Study, and none for a control row", async () => {
    const studyA = await createTestStudy(testDb, { title: 'Study Alpha', shortCode: 'ALPHA', leadPerson: 'Alpha Lead' })
    const studyB = await createTestStudy(testDb, { title: 'Study Beta', shortCode: 'BETA', leadPerson: 'Beta Lead' })
    const subjectA = await createTestStudySubject(testDb, { studyId: studyA.id, name: 'A1' })
    const subjectB = await createTestStudySubject(testDb, { studyId: studyB.id, name: 'B1' })
    const definition = await createTestControlDefinition(testDb, { name: 'Mix', controlType: 'blood' })
    const batch = await createTestControlBatch(testDb, definition.id, { name: 'Batch-1' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
    const specA = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectA.id })
    const specB = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subjectB.id })
    const specControl = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const containers = [
      await createTestStorageContainer(testDb, { specimenId: specA.id, unitId: unit.id }),
      await createTestStorageContainer(testDb, { specimenId: specB.id, unitId: unit.id }),
      await createTestStorageContainer(testDb, { specimenId: specControl.id, unitId: unit.id }),
    ]

    const enriched = await enrichContainerData(testDb, containers)

    const studyFields = (row: (typeof enriched)[number] | undefined) => ({
      study_id: row?.study_id,
      study_code: row?.study_code,
      study_title: row?.study_title,
      study_lead_person: row?.study_lead_person,
    })
    expect(enriched).toHaveLength(3)
    expect(studyFields(enriched.find((row) => row.subject_name === 'A1'))).toEqual({
      study_id: studyA.id,
      study_code: 'ALPHA',
      study_title: 'Study Alpha',
      study_lead_person: 'Alpha Lead',
    })
    expect(studyFields(enriched.find((row) => row.subject_name === 'B1'))).toEqual({
      study_id: studyB.id,
      study_code: 'BETA',
      study_title: 'Study Beta',
      study_lead_person: 'Beta Lead',
    })
    expect(studyFields(enriched.find((row) => row.control_batch_id === batch.id))).toEqual({
      study_id: undefined,
      study_code: undefined,
      study_title: undefined,
      study_lead_person: undefined,
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

    const enriched = await enrichContainerData(testDb, [container])

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

    const enriched = await enrichContainerData(testDb, [container])

    expect(enriched).toHaveLength(1)
    expect(enriched[0].tags).toBe('Hold, QC')
    expect('state' in enriched[0]).toBe(false)
  })
})
