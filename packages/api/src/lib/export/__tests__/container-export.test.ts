import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import type { ContainerExportData } from '@sampledb/contract'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
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
  createTestStudy,
  createTestStudySubject,
  createTestTag,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { specimen as specimenTable, storageContainerTag } from '../../../db/schema'
import { runBarcodeContainerExportPost, runMultiStudyContainerExportPost } from '../container-export'
import type { MultiStudyExportSummary } from '../types'

const columns = ['container_id', 'container_type', 'barcode', 'subject_name', 'study_code', 'control_batch_name']

describe('Container export executors', () => {
  let db: Database
  let sqlite: SQLiteDatabase
  let unitId: number
  let specimenTypeId: number
  let plateId: number
  let cryovialBoxId: number
  let barcodeCount = 0

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    db = setup.db
    sqlite = setup.sqlite
    unitId = (await createTestUnit(db, { symbol: 'uL', name: 'microliter', category: 'volume' })).id as number
    specimenTypeId = (await createTestSpecimenType(db, { name: 'Blood' })).id
    const storageTypeId = String((await createTestStorageType(db, { name: 'Freezer -80' })).id)
    const freezer = await createTestLocation(db, { name: 'Freezer', storageTypeId, canContainCollections: true })
    plateId = (await createTestMicronixPlate(db, { name: 'Plate', locationId: freezer.id })).id
    cryovialBoxId = (await createTestCryovialBox(db, { name: 'Box', locationId: freezer.id })).id
  })

  afterEach(() => cleanupTestDatabase(sqlite))

  async function seedSpecimen(
    source: { studySubjectId: number } | { controlBatchId: number },
    collectionDate?: string,
  ) {
    const row = await createTestSpecimen(db, specimenTypeId, source)
    await db
      .update(specimenTable)
      .set({ collectionDate: collectionDate ?? null })
      .where(eq(specimenTable.id, row.id))
    return row
  }

  async function seedTube(specimenId: number, barcode?: string) {
    const container = await createTestStorageContainer(db, { specimenId, unitId })
    barcodeCount += 1
    await createTestMicronixTube(db, {
      containerId: container.id,
      collectionId: plateId,
      barcode: barcode ?? `MX${barcodeCount}`,
    })
    return container
  }

  async function seedCryovial(specimenId: number) {
    const container = await createTestStorageContainer(db, { specimenId, unitId })
    await createTestCryovialTube(db, { containerId: container.id, collectionId: cryovialBoxId })
    return container
  }

  const containerIds = (data: unknown) =>
    (data as ContainerExportData[]).map((row) => row.container_id).sort((a, b) => a - b)

  describe('runMultiStudyContainerExportPost', () => {
    /** Two Studies sharing a Subject name, with visits, a cryovial and an unknown Subject. */
    async function seedTwoStudies() {
      const alpha = await createTestStudy(db, { title: 'Alpha', shortCode: 'ALPHA', leadPerson: 'Ada' })
      const beta = await createTestStudy(db, { title: 'Beta', shortCode: 'BETA', leadPerson: 'Bo' })
      const alphaS01 = await createTestStudySubject(db, { studyId: alpha.id, name: 'S01' })
      const alphaS02 = await createTestStudySubject(db, { studyId: alpha.id, name: 'S02' })
      const betaS01 = await createTestStudySubject(db, { studyId: beta.id, name: 'S01' })
      const alphaJan = await seedTube((await seedSpecimen({ studySubjectId: alphaS01.id }, '2024-01-01')).id)
      await seedTube((await seedSpecimen({ studySubjectId: alphaS01.id }, '2024-03-01')).id)
      const alphaS02Cryovial = await seedCryovial((await seedSpecimen({ studySubjectId: alphaS02.id }, '2024-01-01')).id)
      const betaSpecimen = await seedSpecimen({ studySubjectId: betaS01.id }, '2024-06-01')
      const betaTube = await seedTube(betaSpecimen.id)
      const betaCryovial = await seedCryovial(betaSpecimen.id)
      return { alphaJan, alphaS02Cryovial, betaTube, betaCryovial }
    }

    const entries = [
      { study_short_code: 'ALPHA', subject_name: 'S01', collection_date: '2024-01-01' },
      { study_short_code: 'ALPHA', subject_name: 'S02' },
      { study_short_code: 'ALPHA', subject_name: 'NOBODY' },
      { study_short_code: 'BETA', subject_name: 'S01' },
    ]

    it('exports every listed Subject across Studies and summarises each Study', async () => {
      const { alphaJan, alphaS02Cryovial, betaTube, betaCryovial } = await seedTwoStudies()

      const result = await runMultiStudyContainerExportPost(db, { entries, filters: {}, format: 'json', columns })

      if (!('data' in result)) throw new Error('expected an export envelope')
      expect(containerIds(result.data)).toEqual([alphaJan.id, alphaS02Cryovial.id, betaTube.id, betaCryovial.id])
      const studyCodeByContainer = new Map(
        (result.data as ContainerExportData[]).map((row) => [row.container_id, row.study_code]),
      )
      expect(studyCodeByContainer.get(alphaJan.id)).toBe('ALPHA')
      expect(studyCodeByContainer.get(betaTube.id)).toBe('BETA')
      expect(result.summary).toEqual({
        total_containers: 4,
        studies: [
          {
            study_code: 'ALPHA',
            study_title: 'Alpha',
            study_lead_person: 'Ada',
            containers: 2,
            subjects_with_results: [
              { name: 'S01', count: 1 },
              { name: 'S02', count: 1 },
            ],
            subjects_no_results: [],
            subjects_not_found: ['NOBODY'],
          },
          {
            study_code: 'BETA',
            study_title: 'Beta',
            study_lead_person: 'Bo',
            containers: 2,
            subjects_with_results: [{ name: 'S01', count: 2 }],
            subjects_no_results: [],
            subjects_not_found: [],
          },
        ],
        invalid_study_codes: [],
      } satisfies MultiStudyExportSummary)
    })

    it('applies the container type filter once and counts Subjects left without Containers', async () => {
      const { alphaJan, betaTube } = await seedTwoStudies()

      const result = await runMultiStudyContainerExportPost(db, {
        entries,
        filters: { container_types: ['micronix_tube'] },
        format: 'json',
        columns,
      })

      if (!('data' in result)) throw new Error('expected an export envelope')
      expect(containerIds(result.data)).toEqual([alphaJan.id, betaTube.id])
      const summary = result.summary as MultiStudyExportSummary
      expect(summary.total_containers).toBe(2)
      expect(summary.studies[0]).toMatchObject({
        containers: 1,
        subjects_with_results: [{ name: 'S01', count: 1 }],
        subjects_no_results: ['S02'],
        subjects_not_found: ['NOBODY'],
      })
      expect(summary.studies[1]).toMatchObject({ containers: 1, subjects_with_results: [{ name: 'S01', count: 1 }] })
    })

    it('keeps only Containers carrying every selected Tag', async () => {
      const { alphaJan, betaTube } = await seedTwoStudies()
      const first = await createTestTag(db, { name: 'first' })
      const second = await createTestTag(db, { name: 'second' })
      await db.insert(storageContainerTag).values([
        { storageContainerId: alphaJan.id, tagId: first.id },
        { storageContainerId: alphaJan.id, tagId: second.id },
        { storageContainerId: betaTube.id, tagId: first.id },
      ])

      const result = await runMultiStudyContainerExportPost(db, {
        entries,
        filters: { tag_ids: [first.id, second.id] },
        format: 'json',
        columns,
      })

      if (!('data' in result)) throw new Error('expected an export envelope')
      expect(containerIds(result.data)).toEqual([alphaJan.id])
    })

    it('keeps every listed visit of a Subject', async () => {
      const study = await createTestStudy(db, { title: 'Visits', shortCode: 'VIS' })
      const subject = await createTestStudySubject(db, { studyId: study.id, name: 'S01' })
      const jan = await seedTube((await seedSpecimen({ studySubjectId: subject.id }, '2024-01-01')).id)
      const feb = await seedTube((await seedSpecimen({ studySubjectId: subject.id }, '2024-02-03')).id)
      await seedTube((await seedSpecimen({ studySubjectId: subject.id }, '2024-03-01')).id)

      const result = await runMultiStudyContainerExportPost(db, {
        entries: [
          { study_short_code: 'VIS', subject_name: 'S01', collection_date: '2024-01-01' },
          { study_short_code: 'VIS', subject_name: 'S01', collection_date: '2024-02-01' },
        ],
        filters: {},
        format: 'json',
        columns,
        dateTolerance: 2,
      })

      if (!('data' in result)) throw new Error('expected an export envelope')
      expect(containerIds(result.data)).toEqual([jan.id, feb.id])
    })

    it('counts with the same summary as the export', async () => {
      await seedTwoStudies()

      const exported = await runMultiStudyContainerExportPost(db, { entries, filters: {}, format: 'json', columns })
      const counted = await runMultiStudyContainerExportPost(db, {
        entries,
        filters: {},
        format: 'json',
        countOnly: true,
      })

      expect(counted).toEqual({ count: 4, summary: exported.summary as MultiStudyExportSummary })
    })

    it('reports a Study whose Subjects are all unknown', async () => {
      await seedTwoStudies()

      const result = await runMultiStudyContainerExportPost(db, {
        entries: [{ study_short_code: 'BETA', subject_name: 'NOBODY' }],
        filters: {},
        format: 'json',
        countOnly: true,
      })

      expect(result).toEqual({
        count: 0,
        summary: {
          total_containers: 0,
          studies: [
            {
              study_code: 'BETA',
              study_title: 'Beta',
              study_lead_person: 'Bo',
              containers: 0,
              subjects_with_results: [],
              subjects_no_results: [],
              subjects_not_found: ['NOBODY'],
            },
          ],
          invalid_study_codes: [],
        },
      })
    })

    it('exports nothing when a study code is invalid', async () => {
      await seedTwoStudies()

      const result = await runMultiStudyContainerExportPost(db, {
        entries: [...entries, { study_short_code: 'NOPE', subject_name: 'S01' }],
        filters: {},
        format: 'json',
        countOnly: true,
      })

      expect(result).toEqual({
        count: 0,
        summary: {
          total_containers: 0,
          studies: [],
          invalid_study_codes: ['NOPE'],
          errors: ['Invalid study codes: NOPE'],
        },
      })
    })
  })

  describe('runBarcodeContainerExportPost', () => {
    it('exports exactly the listed tubes, whatever their Source, and reports unknown barcodes', async () => {
      const alpha = await createTestStudy(db, { title: 'Alpha', shortCode: 'ALPHA' })
      const beta = await createTestStudy(db, { title: 'Beta', shortCode: 'BETA' })
      const alphaSubject = await createTestStudySubject(db, { studyId: alpha.id, name: 'S01' })
      const betaSubject = await createTestStudySubject(db, { studyId: beta.id, name: 'S01' })
      const batch = await createTestControlBatch(db, (await createTestControlDefinition(db)).id, { name: 'Batch 1' })
      const alphaSpecimen = await seedSpecimen({ studySubjectId: alphaSubject.id })
      const alphaTube = await seedTube(alphaSpecimen.id, 'A1')
      await seedTube(alphaSpecimen.id, 'A2')
      const betaTube = await seedTube((await seedSpecimen({ studySubjectId: betaSubject.id })).id, 'B1')
      const controlTube = await seedTube((await seedSpecimen({ controlBatchId: batch.id })).id, 'C1')

      const result = await runBarcodeContainerExportPost(db, {
        barcodes: ['A1', 'B1', 'C1', 'NOPE', 'A1'],
        format: 'json',
        columns,
      })

      expect(result.summary).toEqual({
        total_containers: 3,
        barcodes_found: ['A1', 'B1', 'C1'],
        barcodes_not_found: ['NOPE'],
      })
      const rows = result.data as ContainerExportData[]
      expect(containerIds(rows)).toEqual([alphaTube.id, betaTube.id, controlTube.id])
      const byId = new Map(rows.map((row) => [row.container_id, row]))
      expect(byId.get(alphaTube.id)?.study_code).toBe('ALPHA')
      expect(byId.get(betaTube.id)?.study_code).toBe('BETA')
      expect(byId.get(controlTube.id)).toMatchObject({ control_batch_name: 'Batch 1' })
      expect(byId.get(controlTube.id)?.study_code).toBeUndefined()
    })

    it('returns an empty export when no barcode matches', async () => {
      const result = await runBarcodeContainerExportPost(db, { barcodes: ['NOPE'], format: 'json', columns })

      expect(result.summary).toEqual({ total_containers: 0, barcodes_found: [], barcodes_not_found: ['NOPE'] })
      expect(result.data).toEqual([])
    })
  })
})
