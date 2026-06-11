import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestStudy,
  createTestStudySubject,
  createTestControlDefinition,
  createTestControlBatch,
} from '../../../__tests__/helpers/factories'
import { box, cryovialBox, cryovialTube, micronixTube, paper, sheet } from '../../../db/schema'
import { utcNow } from '../../datetime'
import { resolveParentContainerId } from '../parent-container-resolver'
import type { DerivationCsvRow } from '../../derivations-csv'

function row(fields: Partial<DerivationCsvRow>): DerivationCsvRow {
  return fields as DerivationCsvRow
}

/** Create a top-level location with a storage type (satisfies the location CHECK). */
async function freezer(database: Database, name = 'Freezer') {
  const storageType = await createTestStorageType(database, { name: `Type-${Date.now()}-${Math.random()}` })
  return createTestLocation(database, {
    name: `${name}-${Date.now()}`,
    storageTypeId: String(storageType.id),
    canContainCollections: true,
  })
}

describe('resolveParentContainerId', () => {
  let testDb: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) cleanupTestDatabase(sqlite)
  })

  describe('explicit id', () => {
    it('returns the container id when it exists', async () => {
      const container = await createTestStorageContainer(testDb)
      const id = await resolveParentContainerId(testDb, row({ parent_container_id: String(container.id) }))
      expect(id).toBe(container.id)
    })

    it('throws when the id does not exist', async () => {
      await expect(resolveParentContainerId(testDb, row({ parent_container_id: '999999' }))).rejects.toThrow(
        "Parent container id '999999' not found",
      )
    })
  })

  describe('barcode', () => {
    it('resolves a micronix tube by barcode', async () => {
      const location = await freezer(testDb)
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate-1', locationId: location.id })
      const container = await createTestStorageContainer(testDb)
      await testDb.insert(micronixTube).values({
        id: container.id,
        collectionId: plate.id,
        barcode: 'MT-100',
        position: 'A01',
      })

      const id = await resolveParentContainerId(testDb, row({ parent_container_barcode: 'MT-100' }))
      expect(id).toBe(container.id)
    })

    it('throws when the barcode is not found', async () => {
      await expect(resolveParentContainerId(testDb, row({ parent_container_barcode: 'MISSING' }))).rejects.toThrow(
        "Parent container barcode 'MISSING' not found",
      )
    })
  })

  describe('control batch identification', () => {
    it('requires a specimen type name', async () => {
      await expect(
        resolveParentContainerId(testDb, row({ parent_control_batch_name: 'B1' })),
      ).rejects.toThrow('Control batch parents require parent_specimen_type_name')
    })

    it('resolves a cryovial tube belonging to the batch specimen', async () => {
      const definition = await createTestControlDefinition(testDb, { name: 'Def', controlType: 'blood' })
      const batch = await createTestControlBatch(testDb, definition.id, { name: 'CB-1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Control Blood' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })
      const container = await createTestStorageContainer(testDb, { specimenId: spec.id })
      const location = await freezer(testDb)
      const [boxRow] = await testDb
        .insert(cryovialBox)
        .values({ name: 'Box-1', barcode: 'BOX-1', locationId: location.id })
        .returning()
      await testDb.insert(cryovialTube).values({
        id: container.id,
        collectionId: boxRow.id,
        position: 'B02',
      })

      const id = await resolveParentContainerId(
        testDb,
        row({
          parent_control_batch_name: 'CB-1',
          parent_specimen_type_name: 'Control Blood',
          parent_container_type: 'cryovial_tube',
          parent_box_barcode: 'BOX-1',
          parent_position: 'B02',
        }),
      )
      expect(id).toBe(container.id)
    })

    it('throws when no specimen of that type exists in the batch', async () => {
      const definition = await createTestControlDefinition(testDb, { name: 'Def2', controlType: 'blood' })
      const batch = await createTestControlBatch(testDb, definition.id, { name: 'CB-2' })
      await createTestSpecimenType(testDb, { name: 'Absent Type' })

      await expect(
        resolveParentContainerId(
          testDb,
          row({ parent_control_batch_name: 'CB-2', parent_specimen_type_name: 'Absent Type' }),
        ),
      ).rejects.toThrow("No Absent Type specimen found in control batch 'CB-2'")
    })
  })

  describe('type-based resolution', () => {
    it('resolves a cryovial tube by box barcode and position', async () => {
      const container = await createTestStorageContainer(testDb)
      const location = await freezer(testDb)
      const [boxRow] = await testDb
        .insert(cryovialBox)
        .values({ name: 'Box-T', barcode: 'BOX-T', locationId: location.id })
        .returning()
      await testDb.insert(cryovialTube).values({
        id: container.id,
        collectionId: boxRow.id,
        position: 'C03',
      })

      const id = await resolveParentContainerId(
        testDb,
        row({ parent_container_type: 'cryovial_tube', parent_box_barcode: 'BOX-T', parent_position: 'C03' }),
      )
      expect(id).toBe(container.id)
    })

    it('throws for micronix parents identified only by type', async () => {
      await expect(
        resolveParentContainerId(testDb, row({ parent_container_type: 'micronix_tube' })),
      ).rejects.toThrow('Micronix parent containers require parent_container_barcode or parent_container_id')
    })

    it('throws when cryovial type lacks box barcode and position', async () => {
      await expect(
        resolveParentContainerId(testDb, row({ parent_container_type: 'cryovial_tube' })),
      ).rejects.toThrow('Cryovial parents require parent_box_barcode and parent_position')
    })

    it('resolves a paper container for a study subject specimen', async () => {
      const study = await createTestStudy(testDb, { title: 'Study', shortCode: 'STD1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj-1' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      const container = await createTestStorageContainer(testDb, { specimenId: spec.id })
      // Make the container a paper container by attaching a paper subtype row.
      const sheetId = await createSheet(testDb)
      await testDb.insert(paper).values({
        id: container.id,
        sheetId,
        sublabel: 'Spot-A',
      })

      const id = await resolveParentContainerId(
        testDb,
        row({
          parent_container_type: 'paper',
          parent_study_short_code: 'STD1',
          parent_subject_name: 'Subj-1',
          parent_specimen_type_name: 'Whole Blood',
        }),
      )
      expect(id).toBe(container.id)
    })
  })

  it('throws when no parent identifier is provided', async () => {
    await expect(resolveParentContainerId(testDb, row({}))).rejects.toThrow(
      'Unable to resolve parent container',
    )
  })
})

/** Create a minimal box → sheet so a paper container can be attached. */
async function createSheet(database: Database): Promise<number> {
  const now = utcNow()
  const location = await freezer(database, 'Paper Freezer')
  const [boxRow] = await database
    .insert(box)
    .values({ name: `PaperBox-${Date.now()}`, locationId: location.id, created: now, lastUpdated: now })
    .returning()
  const [sheetRow] = await database
    .insert(sheet)
    .values({ boxId: boxRow.id, name: `Sheet-${Date.now()}`, created: now, lastUpdated: now })
    .returning()
  return sheetRow.id
}
