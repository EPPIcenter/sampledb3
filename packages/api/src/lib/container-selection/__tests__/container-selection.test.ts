import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { count, eq } from 'drizzle-orm'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { SQL_IN_CHUNK_SIZE } from '../../sql-helpers'
import {
  createTestControlBatch,
  createTestControlDefinition,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestLocation,
  createTestMicronixPlate,
  createTestMicronixTube,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestStaticWell,
  createTestPaper,
  createTestSheet,
  createTestBox,
  createTestBag,
  createTestStudy,
  createTestStudySubject,
  createTestTag,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import {
  specimen as specimenTable,
  storageContainer as storageContainerTable,
  storageContainerTag,
} from '../../../db/schema'
import { containerHasAllTags, selectContainers, type ContainerSelection, type ContainerSelectionFilters } from '..'

describe('selectContainers', () => {
  let db: Database
  let sqlite: SQLiteDatabase
  let unitId: number
  let specimenTypeId: number
  let plateId: number
  let cryovialBoxId: number
  let storageTypeId: string
  let barcodeCount = 0

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    db = setup.db
    sqlite = setup.sqlite
    unitId = (await createTestUnit(db, { symbol: 'uL', name: 'microliter', category: 'volume' })).id as number
    specimenTypeId = (await createTestSpecimenType(db, { name: 'Blood' })).id
    storageTypeId = String((await createTestStorageType(db, { name: 'Freezer -80' })).id)
    const freezer = await createTestLocation(db, { name: 'Freezer', storageTypeId, canContainCollections: true })
    plateId = (await createTestMicronixPlate(db, { name: 'Plate', locationId: freezer.id })).id
    cryovialBoxId = (await createTestCryovialBox(db, { name: 'Box', locationId: freezer.id })).id
  })

  afterEach(() => cleanupTestDatabase(sqlite))

  async function seedSubject(studyId: number, name: string) {
    return createTestStudySubject(db, { studyId, name })
  }

  async function seedSpecimen(
    source: { studySubjectId: number } | { controlBatchId: number },
    fields: { collectionDate?: string; created?: string; specimenTypeId?: number } = {},
  ) {
    const row = await createTestSpecimen(db, fields.specimenTypeId ?? specimenTypeId, source)
    await db
      .update(specimenTable)
      .set({
        collectionDate: fields.collectionDate ?? null,
        ...(fields.created ? { created: fields.created } : {}),
      })
      .where(eq(specimenTable.id, row.id))
    return row
  }

  type ContainerKind = 'micronix_tube' | 'cryovial_tube' | 'untyped'

  async function seedContainer(
    specimenId: number,
    options: { kind?: ContainerKind; created?: string; collectionId?: number; barcode?: string } = {},
  ) {
    const container = await createTestStorageContainer(db, { specimenId, unitId })
    if (options.created) {
      await db
        .update(storageContainerTable)
        .set({ created: options.created })
        .where(eq(storageContainerTable.id, container.id))
    }
    const kind = options.kind ?? 'micronix_tube'
    if (kind === 'micronix_tube') {
      barcodeCount += 1
      await createTestMicronixTube(db, {
        containerId: container.id,
        collectionId: options.collectionId ?? plateId,
        barcode: options.barcode ?? `MX${barcodeCount}`,
      })
    } else if (kind === 'cryovial_tube') {
      await createTestCryovialTube(db, { containerId: container.id, collectionId: options.collectionId ?? cryovialBoxId })
    }
    return container
  }

  async function tag(containerId: number, ...tagIds: number[]) {
    await db.insert(storageContainerTag).values(tagIds.map((tagId) => ({ storageContainerId: containerId, tagId })))
  }

  const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id)

  describe('study selection', () => {
    it("returns the Study's Containers, their Specimens and each Container's type", async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const other = await createTestStudy(db, { title: 'Other', shortCode: 'S2' })
      const subject = await seedSubject(study.id, 'P1')
      const otherSubject = await seedSubject(other.id, 'Q1')
      const specimen = await seedSpecimen({ studySubjectId: subject.id })
      const tube = await seedContainer(specimen.id, { kind: 'micronix_tube' })
      const vial = await seedContainer(specimen.id, { kind: 'cryovial_tube' })
      await seedContainer((await seedSpecimen({ studySubjectId: otherSubject.id })).id)

      const result = await selectContainers(db, { kind: 'study', studyId: study.id })

      expect(ids(result.containers)).toEqual([tube.id, vial.id])
      expect(ids(result.specimens)).toEqual([specimen.id])
      expect(result.containerTypes).toEqual(
        new Map([
          [tube.id, 'micronix_tube'],
          [vial.id, 'cryovial_tube'],
        ]),
      )
    })

    it('includes Specimens without Containers when no Container-level filter is set', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const stored = await seedSpecimen({ studySubjectId: subject.id })
      await seedContainer(stored.id)
      const unstored = await seedSpecimen({ studySubjectId: subject.id })

      const result = await selectContainers(db, { kind: 'study', studyId: study.id })

      expect(ids(result.specimens)).toEqual([stored.id, unstored.id])
      expect(result.containers).toHaveLength(1)
    })

    it('matches nothing for an unknown Study id', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      await seedContainer((await seedSpecimen({ studySubjectId: (await seedSubject(study.id, 'P1')).id })).id)

      const result = await selectContainers(db, { kind: 'study', studyId: study.id + 999 })

      expect(result).toEqual({ containers: [], specimens: [], containerTypes: new Map() })
    })
  })

  const selectionKinds: Array<
    [string, (studyId: number, subjectId: number, filters: ContainerSelectionFilters) => ContainerSelection]
  > = [
    ['study', (studyId, _subjectId, filters) => ({ kind: 'study', studyId, filters })],
    ['subject-list', (studyId, subjectId, filters) => ({ kind: 'subjects', subjects: [{ studyId, subjectId }], filters })],
    ['whole-database', (_studyId, _subjectId, filters) => ({ kind: 'database', filters })],
  ]

  describe.each(selectionKinds)('filters on a %s selection', (_kind, select) => {
    it('keeps Specimens of the listed specimen types', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const plasmaTypeId = (await createTestSpecimenType(db, { name: 'Plasma' })).id
      const dbsTypeId = (await createTestSpecimenType(db, { name: 'DBS' })).id
      const blood = await seedSpecimen({ studySubjectId: subject.id })
      const plasma = await seedSpecimen({ studySubjectId: subject.id }, { specimenTypeId: plasmaTypeId })
      await seedSpecimen({ studySubjectId: subject.id }, { specimenTypeId: dbsTypeId })
      const bloodTube = await seedContainer(blood.id)
      const plasmaTube = await seedContainer(plasma.id)

      const result = await selectContainers(db, select(study.id, subject.id, { specimenTypeIds: [specimenTypeId, plasmaTypeId] }))

      expect(ids(result.specimens)).toEqual([blood.id, plasma.id])
      expect(ids(result.containers)).toEqual([bloodTube.id, plasmaTube.id])
    })

    it('keeps Specimens collected inside the collection date range, both ends inclusive', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      await seedSpecimen({ studySubjectId: subject.id }, { collectionDate: '2024-01-31' })
      const first = await seedSpecimen({ studySubjectId: subject.id }, { collectionDate: '2024-02-01' })
      const last = await seedSpecimen({ studySubjectId: subject.id }, { collectionDate: '2024-02-29' })
      await seedSpecimen({ studySubjectId: subject.id }, { collectionDate: '2024-03-01' })
      await seedSpecimen({ studySubjectId: subject.id })

      const result = await selectContainers(db, select(study.id, subject.id, { collectionDate: { from: '2024-02-01', to: '2024-02-29' } }))

      expect(ids(result.specimens)).toEqual([first.id, last.id])
    })

    it('filters Specimen created on the Specimen, not on its Containers', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const january = await seedSpecimen({ studySubjectId: subject.id }, { created: '2024-01-15 10:00:00' })
      const januaryTube = await seedContainer(january.id, { created: '2024-06-01 09:00:00' })
      const june = await seedSpecimen({ studySubjectId: subject.id }, { created: '2024-06-01 09:00:00' })
      await seedContainer(june.id, { created: '2024-01-15 10:00:00' })

      const result = await selectContainers(db, select(study.id, subject.id, { specimenCreated: { from: '2024-01-01', to: '2024-01-31' } }))

      expect(ids(result.specimens)).toEqual([january.id])
      expect(ids(result.containers)).toEqual([januaryTube.id])
    })

    it('filters Container created on the Container, keeping only Specimens with a matching Container', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const january = await seedSpecimen({ studySubjectId: subject.id }, { created: '2024-06-01 09:00:00' })
      const januaryTube = await seedContainer(january.id, { created: '2024-01-31 23:59:59' })
      await seedContainer(january.id, { created: '2024-02-01 00:00:00' })
      const june = await seedSpecimen({ studySubjectId: subject.id }, { created: '2024-01-15 10:00:00' })
      await seedContainer(june.id, { created: '2024-06-01 09:00:00' })
      await seedSpecimen({ studySubjectId: subject.id }, { created: '2024-01-15 10:00:00' })

      const result = await selectContainers(db, select(study.id, subject.id, { containerCreated: { from: '2024-01-01', to: '2024-01-31' } }))

      expect(ids(result.containers)).toEqual([januaryTube.id])
      expect(ids(result.specimens)).toEqual([january.id])
    })

    it('keeps Containers of the listed container types, and only their Specimens', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const both = await seedSpecimen({ studySubjectId: subject.id })
      await seedContainer(both.id, { kind: 'micronix_tube' })
      const vial = await seedContainer(both.id, { kind: 'cryovial_tube' })
      const tubeOnly = await seedSpecimen({ studySubjectId: subject.id })
      await seedContainer(tubeOnly.id, { kind: 'micronix_tube' })
      const untypedOnly = await seedSpecimen({ studySubjectId: subject.id })
      const untyped = await seedContainer(untypedOnly.id, { kind: 'untyped' })

      const vials = await selectContainers(db, select(study.id, subject.id, { containerTypes: ['cryovial_tube', 'not_a_type'] }))
      const unknown = await selectContainers(db, select(study.id, subject.id, { containerTypes: ['unknown'] }))

      expect(ids(vials.containers)).toEqual([vial.id])
      expect(ids(vials.specimens)).toEqual([both.id])
      expect(vials.containerTypes).toEqual(new Map([[vial.id, 'cryovial_tube']]))
      expect(ids(unknown.containers)).toEqual([untyped.id])
      expect(ids(unknown.specimens)).toEqual([untypedOnly.id])
    })

    it('matches nothing when every listed container type is unknown', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      await seedContainer((await seedSpecimen({ studySubjectId: subject.id })).id)

      const result = await selectContainers(db, select(study.id, subject.id, { containerTypes: ['not_a_type'] }))

      expect(result).toEqual({ containers: [], specimens: [], containerTypes: new Map() })
    })

    it('keeps Containers carrying every selected Tag, and only their Specimens', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const red = (await createTestTag(db, { name: 'red' })).id
      const blue = (await createTestTag(db, { name: 'blue' })).id
      const both = await seedSpecimen({ studySubjectId: subject.id })
      const bothTube = await seedContainer(both.id)
      await tag(bothTube.id, red, blue)
      const redOnly = await seedSpecimen({ studySubjectId: subject.id })
      await tag((await seedContainer(redOnly.id)).id, red)

      const result = await selectContainers(db, select(study.id, subject.id, { tagIds: [red, blue] }))

      expect(ids(result.containers)).toEqual([bothTube.id])
      expect(ids(result.specimens)).toEqual([both.id])
    })

    it('matches nothing when a selected Tag id is unknown', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const red = (await createTestTag(db, { name: 'red' })).id
      const subject = await seedSubject(study.id, 'P1')
      const specimen = await seedSpecimen({ studySubjectId: subject.id })
      await tag((await seedContainer(specimen.id)).id, red)

      const result = await selectContainers(db, select(study.id, subject.id, { tagIds: [red, red + 999] }))

      expect(result.containers).toEqual([])
    })

    it('keeps Containers stored in the Location or any Location under it, and only their Specimens', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const room = await createTestLocation(db, { name: 'Room', storageTypeId })
      const rack = await createTestLocation(db, { name: 'Rack', parentId: room.id, canContainCollections: true })
      const shelf = await createTestLocation(db, { name: 'Shelf', parentId: rack.id, canContainCollections: true })
      const shelfPlate = (await createTestMicronixPlate(db, { name: 'Shelf plate', locationId: shelf.id })).id
      const rackBox = (await createTestCryovialBox(db, { name: 'Rack box', locationId: rack.id })).id
      const shelfSheet = (
        await createTestSheet(db, { name: 'Sheet A', boxId: (await createTestBox(db, { name: 'Card box', locationId: shelf.id })).id })
      ).id
      const rackSheet = (
        await createTestSheet(db, { name: 'Sheet B', bagId: (await createTestBag(db, { name: 'Bag', locationId: rack.id })).id })
      ).id

      const specimen = await seedSpecimen({ studySubjectId: subject.id })
      const tube = await seedContainer(specimen.id, { collectionId: shelfPlate })
      const vial = await seedContainer(specimen.id, { kind: 'cryovial_tube', collectionId: rackBox })
      const well = await seedContainer(specimen.id, { kind: 'untyped' })
      await createTestStaticWell(db, { containerId: well.id, collectionId: shelfPlate })
      const boxedPaper = await seedContainer(specimen.id, { kind: 'untyped' })
      await createTestPaper(db, { containerId: boxedPaper.id, sheetId: shelfSheet })
      const baggedPaper = await seedContainer(specimen.id, { kind: 'untyped' })
      await createTestPaper(db, { containerId: baggedPaper.id, sheetId: rackSheet })
      await seedContainer(specimen.id)
      await seedContainer(specimen.id, { kind: 'untyped' })
      const elsewhere = await seedSpecimen({ studySubjectId: subject.id })
      await seedContainer(elsewhere.id)

      const underRack = await selectContainers(db, select(study.id, subject.id, { locationId: rack.id }))
      const underShelf = await selectContainers(db, select(study.id, subject.id, { locationId: shelf.id }))
      const unknown = await selectContainers(db, select(study.id, subject.id, { locationId: 99999 }))

      expect(ids(underRack.containers)).toEqual([tube.id, vial.id, well.id, boxedPaper.id, baggedPaper.id])
      expect(ids(underRack.specimens)).toEqual([specimen.id])
      expect(ids(underShelf.containers)).toEqual([tube.id, well.id, boxedPaper.id])
      expect(unknown).toEqual({ containers: [], specimens: [], containerTypes: new Map() })
    })
  })

  describe('subject-list selection', () => {
    it('selects the listed Subjects across Studies, and nothing for a Subject listed under the wrong Study or an unknown id', async () => {
      const first = await createTestStudy(db, { title: 'First', shortCode: 'S1' })
      const second = await createTestStudy(db, { title: 'Second', shortCode: 'S2' })
      const p1 = await seedSubject(first.id, 'P1')
      const p2 = await seedSubject(first.id, 'P2')
      const q1 = await seedSubject(second.id, 'Q1')
      const q2 = await seedSubject(second.id, 'Q2')
      const p1Specimen = await seedSpecimen({ studySubjectId: p1.id })
      const p1Tube = await seedContainer(p1Specimen.id)
      await seedContainer((await seedSpecimen({ studySubjectId: p2.id })).id)
      const q1Specimen = await seedSpecimen({ studySubjectId: q1.id })
      const q1Tube = await seedContainer(q1Specimen.id)
      await seedContainer((await seedSpecimen({ studySubjectId: q2.id })).id)

      const result = await selectContainers(db, {
        kind: 'subjects',
        subjects: [
          { studyId: first.id, subjectId: p1.id },
          { studyId: second.id, subjectId: q1.id },
          { studyId: first.id, subjectId: q2.id },
          { studyId: first.id, subjectId: 99999 },
        ],
      })

      expect(ids(result.specimens)).toEqual([p1Specimen.id, q1Specimen.id])
      expect(ids(result.containers)).toEqual([p1Tube.id, q1Tube.id])
    })

    it("uses a Subject's own dates instead of the global range, and the global range for undated Subjects", async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const dated = await seedSubject(study.id, 'P1')
      const undated = await seedSubject(study.id, 'P2')
      const visitOne = await seedSpecimen({ studySubjectId: dated.id }, { collectionDate: '2023-03-01' })
      const visitTwo = await seedSpecimen({ studySubjectId: dated.id }, { collectionDate: '2023-06-10' })
      await seedSpecimen({ studySubjectId: dated.id }, { collectionDate: '2024-01-15' })
      const inRange = await seedSpecimen({ studySubjectId: undated.id }, { collectionDate: '2024-01-15' })
      await seedSpecimen({ studySubjectId: undated.id }, { collectionDate: '2023-03-01' })

      const result = await selectContainers(db, {
        kind: 'subjects',
        subjects: [
          { studyId: study.id, subjectId: dated.id, dates: [{ exact: '2023-03-01' }, { from: '2023-06-01', to: '2023-06-30' }] },
          { studyId: study.id, subjectId: undated.id },
        ],
        filters: { collectionDate: { from: '2024-01-01', to: '2024-12-31' } },
      })

      expect(ids(result.specimens)).toEqual([visitOne.id, visitTwo.id, inRange.id])
    })

    it('widens exact per-Subject dates by the tolerance, but not date ranges', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const exact = await seedSubject(study.id, 'P1')
      const ranged = await seedSubject(study.id, 'P2')
      const twoDaysBefore = await seedSpecimen({ studySubjectId: exact.id }, { collectionDate: '2024-02-28' })
      const twoDaysAfter = await seedSpecimen({ studySubjectId: exact.id }, { collectionDate: '2024-03-03' })
      await seedSpecimen({ studySubjectId: exact.id }, { collectionDate: '2024-03-04' })
      const rangeEnd = await seedSpecimen({ studySubjectId: ranged.id }, { collectionDate: '2024-03-31' })
      await seedSpecimen({ studySubjectId: ranged.id }, { collectionDate: '2024-04-01' })

      const result = await selectContainers(db, {
        kind: 'subjects',
        subjects: [
          { studyId: study.id, subjectId: exact.id, dates: [{ exact: '2024-03-01' }] },
          { studyId: study.id, subjectId: ranged.id, dates: [{ from: '2024-03-01', to: '2024-03-31' }] },
        ],
        dateTolerance: 2,
      })

      expect(ids(result.specimens)).toEqual([twoDaysBefore.id, twoDaysAfter.id, rangeEnd.id])
    })

    it('treats a Subject listed both with and without dates as undated', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subject = await seedSubject(study.id, 'P1')
      const march = await seedSpecimen({ studySubjectId: subject.id }, { collectionDate: '2024-03-01' })
      const may = await seedSpecimen({ studySubjectId: subject.id }, { collectionDate: '2024-05-01' })

      const result = await selectContainers(db, {
        kind: 'subjects',
        subjects: [
          { studyId: study.id, subjectId: subject.id, dates: [{ exact: '2024-03-01' }] },
          { studyId: study.id, subjectId: subject.id },
        ],
      })

      expect(ids(result.specimens)).toEqual([march.id, may.id])
    })

    it('selects nothing for an empty subject list', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      await seedContainer((await seedSpecimen({ studySubjectId: (await seedSubject(study.id, 'P1')).id })).id)

      const result = await selectContainers(db, { kind: 'subjects', subjects: [] })

      expect(result).toEqual({ containers: [], specimens: [], containerTypes: new Map() })
    })

    it('selects every listed Subject when the list is longer than one IN chunk', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const firstSubject = await seedSubject(study.id, 'P1')
      const lastSubject = await seedSubject(study.id, 'P2')
      const first = await seedSpecimen({ studySubjectId: firstSubject.id }, { collectionDate: '2024-01-01' })
      const last = await seedSpecimen({ studySubjectId: lastSubject.id }, { collectionDate: '2024-01-01' })
      const unknownSubjects = Array.from({ length: SQL_IN_CHUNK_SIZE }, (_, i) => ({
        studyId: study.id,
        subjectId: 100000 + i,
        dates: [{ exact: '2024-01-01' }],
      }))

      const result = await selectContainers(db, {
        kind: 'subjects',
        subjects: [
          { studyId: study.id, subjectId: firstSubject.id, dates: [{ exact: '2024-01-01' }] },
          ...unknownSubjects,
          { studyId: study.id, subjectId: lastSubject.id },
        ],
      })

      expect(ids(result.specimens)).toEqual([first.id, last.id])
    })
  })

  describe('whole-database selection', () => {
    async function seedSources() {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subjectSpecimen = await seedSpecimen({ studySubjectId: (await seedSubject(study.id, 'P1')).id })
      const definition = await createTestControlDefinition(db)
      const batch = await createTestControlBatch(db, definition.id)
      const controlSpecimen = await seedSpecimen({ controlBatchId: batch.id })
      return { subjectSpecimen, controlSpecimen }
    }

    it('selects Specimens of Subjects and of Control batches', async () => {
      const { subjectSpecimen, controlSpecimen } = await seedSources()

      const result = await selectContainers(db, { kind: 'database' })

      expect(ids(result.specimens)).toEqual([subjectSpecimen.id, controlSpecimen.id])
    })

    it('narrows to one source type', async () => {
      const { subjectSpecimen, controlSpecimen } = await seedSources()

      const subjects = await selectContainers(db, { kind: 'database', sourceType: 'subject' })
      const controls = await selectContainers(db, { kind: 'database', sourceType: 'control' })

      expect(ids(subjects.specimens)).toEqual([subjectSpecimen.id])
      expect(ids(controls.specimens)).toEqual([controlSpecimen.id])
    })
  })

  describe('micronix barcode selection', () => {
    it("selects exactly the listed tubes and their Specimens, whatever the Specimen's Source", async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const subjectSpecimen = await seedSpecimen({ studySubjectId: (await seedSubject(study.id, 'P1')).id })
      const listed = await seedContainer(subjectSpecimen.id, { barcode: 'A1' })
      await seedContainer(subjectSpecimen.id, { barcode: 'A2' })
      await seedContainer(subjectSpecimen.id, { kind: 'cryovial_tube' })
      const batch = await createTestControlBatch(db, (await createTestControlDefinition(db)).id)
      const controlSpecimen = await seedSpecimen({ controlBatchId: batch.id })
      const control = await seedContainer(controlSpecimen.id, { barcode: 'C1' })
      await seedSpecimen({ studySubjectId: (await seedSubject(study.id, 'P2')).id })

      const result = await selectContainers(db, { kind: 'micronixBarcodes', barcodes: ['A1', 'C1', 'NOPE', 'A1'] })

      expect(ids(result.containers)).toEqual([listed.id, control.id])
      expect(ids(result.specimens)).toEqual([subjectSpecimen.id, controlSpecimen.id])
      expect(result.containerTypes).toEqual(
        new Map([
          [listed.id, 'micronix_tube'],
          [control.id, 'micronix_tube'],
        ]),
      )
    })

    it('selects every listed tube when the list is longer than one IN chunk', async () => {
      const study = await createTestStudy(db, { title: 'Study', shortCode: 'S1' })
      const specimen = await seedSpecimen({ studySubjectId: (await seedSubject(study.id, 'P1')).id })
      const first = await seedContainer(specimen.id, { barcode: 'FIRST' })
      const last = await seedContainer(specimen.id, { barcode: 'LAST' })
      const unknown = Array.from({ length: SQL_IN_CHUNK_SIZE }, (_, i) => `UNKNOWN${i}`)

      const result = await selectContainers(db, { kind: 'micronixBarcodes', barcodes: ['FIRST', ...unknown, 'LAST'] })

      expect(ids(result.containers)).toEqual([first.id, last.id])
      expect(ids(result.specimens)).toEqual([specimen.id])
    })
  })
})

describe('containerHasAllTags', () => {
  let db: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    db = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => cleanupTestDatabase(sqlite))

  it('filters and counts a paginated Container query by every selected Tag', async () => {
    const red = (await createTestTag(db, { name: 'red' })).id
    const blue = (await createTestTag(db, { name: 'blue' })).id
    const unitId = (await createTestUnit(db, { symbol: 'uL', name: 'microliter', category: 'volume' })).id as number
    const specimenTypeId = (await createTestSpecimenType(db, { name: 'Blood' })).id
    const specimenId = (await createTestSpecimen(db, specimenTypeId)).id
    const containers = []
    for (let i = 0; i < 4; i++) containers.push(await createTestStorageContainer(db, { specimenId, unitId }))
    const links = [
      { storageContainerId: containers[0].id, tagId: red },
      { storageContainerId: containers[0].id, tagId: blue },
      { storageContainerId: containers[1].id, tagId: red },
      { storageContainerId: containers[2].id, tagId: red },
      { storageContainerId: containers[2].id, tagId: blue },
    ]
    await db.insert(storageContainerTag).values(links)

    const where = containerHasAllTags([red, blue, red])
    const page = await db
      .select()
      .from(storageContainerTable)
      .where(where)
      .orderBy(storageContainerTable.id)
      .limit(1)
      .offset(1)
    const [{ total }] = await db.select({ total: count() }).from(storageContainerTable).where(where)

    expect(page.map((row) => row.id)).toEqual([containers[2].id])
    expect(total).toBe(2)
  })
})
