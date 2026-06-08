/**
 * Write-path parity: specimens bulk and combined import produce equivalent Containers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestUnit,
  createTestSpecimen,
  createTestControlDefinition,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults, clearSettingsCache } from '../settings'
import { clearDefaultsCache } from '../defaults'
import {
  specimenTypeContainerType,
  containerTypeUnit,
  micronixTube,
  cryovialTube,
  cryovialBox,
  staticWell,
  paper,
  box,
  bag,
  sheet,
} from '../../db/schema'
import { utcNow } from '../datetime'
import { createBulkSpecimenRows } from '../registration-orchestrator'
import { runBulkCombinedImport } from '../bulk-combined-import'
import { createContainerForSpecimen } from '../container-creation'
import { createBatchWithSpecimens } from '../controls/batch-with-specimens'
import type { ContainerWriteInput } from '@sampledb/contract'

async function setupContainerType(
  testDb: Database,
  containerType: 'micronix_tube' | 'cryovial_tube' | 'static_well' | 'paper',
  specimenTypeName: string
) {
  const unit = await createTestUnit(testDb, {
    symbol: `uL-par-${containerType}-${Date.now()}`,
    name: 'microliter',
    category: 'volume',
  })
  const qty = containerType === 'paper' ? 100 : 1
  const entry = { totalQuantity: qty, remainingQuantity: qty, defaultUnitSymbol: unit.symbol }
  await setContainerDefaults(testDb, {
    micronix_tube: entry,
    cryovial_tube: entry,
    static_well: entry,
    paper: entry,
  })
  for (const ct of ['micronix_tube', 'cryovial_tube', 'static_well', 'paper'] as const) {
    await testDb.insert(containerTypeUnit).values({ containerType: ct, unitId: unit.id })
  }
  const specimenType = await createTestSpecimenType(testDb, { name: specimenTypeName })
  await testDb.insert(specimenTypeContainerType).values({
    specimenTypeId: specimenType.id,
    containerType,
  })
  const storageType = await createTestStorageType(testDb, { name: `Store-${containerType}` })
  const loc = await createTestLocation(testDb, {
    name: `Loc-${containerType}`,
    storageTypeId: String(storageType.id),
    canContainCollections: true,
  })
  return { specimenType, loc, unit }
}

describe('container registration write parity', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    clearSettingsCache()
    clearDefaultsCache()
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    clearDefaultsCache()
    if (sqlite) cleanupTestDatabase(sqlite)
  })

  it('micronix_tube: bulk specimen and combined import produce same barcode, position, collection', async () => {
    const study = await createTestStudy(testDb, { title: 'Parity Mic', shortCode: 'PMIC' })
    const { specimenType, loc } = await setupContainerType(testDb, 'micronix_tube', 'Whole Blood')
    const plate = await createTestMicronixPlate(testDb, { name: 'ParityPlate', locationId: loc.id })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'SubjBulk' })

    const bulkResult = await createBulkSpecimenRows(testDb, [
      {
        sourceType: 'subject',
        studyShortCode: study.shortCode,
        subjectName: subject.name,
        specimenTypeName: specimenType.name,
        collectionDate: '2025-06-01',
        container: {
          containerType: 'micronix_tube',
          barcode: 'MIC-PARITY-1',
          collection: { type: 'micronix_plate', name: plate.name, position: 'A1' },
        },
      },
    ])
    expect(bulkResult.success).toBe(true)

    const bulkTube = await testDb
      .select()
      .from(micronixTube)
      .where(eq(micronixTube.barcode, 'MIC-PARITY-1'))
      .get()
    expect(bulkTube).toBeDefined()
    expect(bulkTube!.position).toBe('A01')
    expect(bulkTube!.collectionId).toBe(plate.id)

    const combined = await runBulkCombinedImport(
      testDb,
      {
        studyShortCode: study.shortCode,
        atomicMode: 'full_file',
        subjects: [
          {
            subjectName: 'SubjCombined',
            specimens: [
              {
                specimenTypeName: specimenType.name,
                collectionDate: '2025-06-02',
                container: {
                  containerType: 'micronix_tube',
                  barcode: 'MIC-PARITY-2',
                  collection: { type: 'micronix_plate', name: plate.name, position: 'B1' },
                },
              },
            ],
          },
        ],
      },
      undefined
    )
    expect(combined.summary.containersCreated).toBe(1)

    const combinedTube = await testDb
      .select()
      .from(micronixTube)
      .where(eq(micronixTube.barcode, 'MIC-PARITY-2'))
      .get()
    expect(combinedTube!.position).toBe('B01')
    expect(combinedTube!.collectionId).toBe(plate.id)
  })

  it('cryovial_tube: bulk specimen and combined import produce same barcode, position, collection', async () => {
    const study = await createTestStudy(testDb, { title: 'Parity Cryo', shortCode: 'PCRY' })
    const { specimenType, loc } = await setupContainerType(testDb, 'cryovial_tube', 'Plasma')
    const now = utcNow()
    const [boxRecord] = await testDb
      .insert(cryovialBox)
      .values({ name: 'ParityBox', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'SubjBulk' })

    await createBulkSpecimenRows(testDb, [
      {
        sourceType: 'subject',
        studyShortCode: study.shortCode,
        subjectName: subject.name,
        specimenTypeName: specimenType.name,
        collectionDate: '2025-06-01',
        container: {
          containerType: 'cryovial_tube',
          barcode: 'CRY-PARITY-1',
          collection: { type: 'cryovial_box', name: boxRecord.name, position: 'C1' },
        },
      },
    ])

    await runBulkCombinedImport(
      testDb,
      {
        studyShortCode: study.shortCode,
        atomicMode: 'full_file',
        subjects: [
          {
            subjectName: 'SubjCombined',
            specimens: [
              {
                specimenTypeName: specimenType.name,
                collectionDate: '2025-06-02',
                container: {
                  containerType: 'cryovial_tube',
                  barcode: 'CRY-PARITY-2',
                  collection: { type: 'cryovial_box', name: boxRecord.name, position: 'D1' },
                },
              },
            ],
          },
        ],
      },
      undefined
    )

    const bulkTube = await testDb.select().from(cryovialTube).where(eq(cryovialTube.barcode, 'CRY-PARITY-1')).get()
    const combinedTube = await testDb.select().from(cryovialTube).where(eq(cryovialTube.barcode, 'CRY-PARITY-2')).get()
    expect(bulkTube!.position).toBe('C01')
    expect(combinedTube!.position).toBe('D01')
    expect(bulkTube!.collectionId).toBe(boxRecord.id)
    expect(combinedTube!.collectionId).toBe(boxRecord.id)
  })

  it('static_well: combined import creates well at plate position', async () => {
    const study = await createTestStudy(testDb, { title: 'Parity Well', shortCode: 'PWEL' })
    const { specimenType, loc } = await setupContainerType(testDb, 'static_well', 'Extract')
    const plate = await createTestMicronixPlate(testDb, { name: 'WellPlate', locationId: loc.id })

    await runBulkCombinedImport(
      testDb,
      {
        studyShortCode: study.shortCode,
        atomicMode: 'full_file',
        subjects: [
          {
            subjectName: 'WellSubj',
            specimens: [
              {
                specimenTypeName: specimenType.name,
                collectionDate: '2025-06-01',
                container: {
                  containerType: 'static_well',
                  collection: { type: 'micronix_plate', name: plate.name, position: 'E1' },
                },
              },
            ],
          },
        ],
      },
      undefined
    )

    const well = await testDb.select().from(staticWell).where(eq(staticWell.collectionId, plate.id)).get()
    expect(well!.position).toBe('E01')
  })

  it('paper: bulk specimen creates paper with sheet name and sublabel', async () => {
    const study = await createTestStudy(testDb, { title: 'Parity Paper', shortCode: 'PPAP' })
    const { specimenType, loc } = await setupContainerType(testDb, 'paper', 'DBS')
    const now = utcNow()
    const [boxRecord] = await testDb
      .insert(box)
      .values({ name: 'PaperBox', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'PaperSubj' })

    await createBulkSpecimenRows(testDb, [
      {
        sourceType: 'subject',
        studyShortCode: study.shortCode,
        subjectName: subject.name,
        specimenTypeName: specimenType.name,
        collectionDate: '2025-06-01',
        container: {
          containerType: 'paper',
          sublabel: 'Spot-A',
          collection: {
            type: 'sheet',
            name: 'Sheet-A',
            parent: { type: 'box', name: boxRecord.name },
          },
        },
      },
    ])

    const paperRecord = await testDb.select().from(paper).get()
    expect(paperRecord?.sublabel).toBe('Spot-A')
  })

  it('paper: bulk specimen and direct write input produce equivalent paper rows', async () => {
    const study = await createTestStudy(testDb, { title: 'Parity Write', shortCode: 'PWRT' })
    const { specimenType, loc } = await setupContainerType(testDb, 'paper', 'DBS')
    const now = utcNow()
    const [boxRecord] = await testDb
      .insert(box)
      .values({ name: 'ParityBox', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    const subjectLegacy = await createTestStudySubject(testDb, { studyId: study.id, name: 'LegacySubj' })

    const bulkResult = await createBulkSpecimenRows(testDb, [
      {
        sourceType: 'subject',
        studyShortCode: study.shortCode,
        subjectName: subjectLegacy.name,
        specimenTypeName: specimenType.name,
        collectionDate: '2025-06-01',
        container: {
          containerType: 'paper',
          sublabel: 'Spot-Legacy',
          collection: {
            type: 'sheet',
            name: 'Sheet-Legacy',
            parent: { type: 'box', name: boxRecord.name },
          },
        },
      },
    ])
    expect(bulkResult.success).toBe(true)

    const writeSpec = await createTestSpecimen(testDb, specimenType.id, {
      studySubjectId: subjectLegacy.id,
    })

    const writeInput: ContainerWriteInput = {
      containerType: 'paper',
      sublabel: 'Spot-Write',
      collection: {
        type: 'sheet',
        name: 'Sheet-Write',
        parent: { type: 'box', name: boxRecord.name },
      },
    }

    const writeResult = await createContainerForSpecimen(writeSpec.id, writeInput, testDb)
    expect(writeResult.success).toBe(true)

    const papers = await testDb.select().from(paper)
    expect(papers).toHaveLength(2)
    expect(papers.map((p) => p.sublabel).sort()).toEqual(['Spot-Legacy', 'Spot-Write'])
  })

  it('paper with bag parent: bulk specimen and combined import produce equivalent rows', async () => {
    const study = await createTestStudy(testDb, { title: 'Parity Bag', shortCode: 'PBAG' })
    const { specimenType, loc } = await setupContainerType(testDb, 'paper', 'DBS-Bag')
    const now = utcNow()
    await testDb
      .insert(bag)
      .values({ name: 'ImportBag', locationId: loc.id, created: now, lastUpdated: now })
    const subjectBulk = await createTestStudySubject(testDb, { studyId: study.id, name: 'BagBulk' })

    const writeInput: ContainerWriteInput = {
      containerType: 'paper',
      sublabel: 'Spot-Bag',
      collection: {
        type: 'sheet',
        name: 'Sheet-Bag',
        parent: { type: 'bag', name: 'ImportBag' },
      },
    }

    await createBulkSpecimenRows(testDb, [
      {
        sourceType: 'subject',
        studyShortCode: study.shortCode,
        subjectName: subjectBulk.name,
        specimenTypeName: specimenType.name,
        collectionDate: '2025-06-01',
        container: writeInput,
      },
    ])

    await runBulkCombinedImport(
      testDb,
      {
        studyShortCode: study.shortCode,
        atomicMode: 'full_file',
        subjects: [
          {
            subjectName: 'BagCombined',
            specimens: [
              {
                specimenTypeName: specimenType.name,
                collectionDate: '2025-06-02',
                container: {
                  containerType: 'paper',
                  sublabel: 'Spot-Bag-2',
                  collection: {
                    type: 'sheet',
                    name: 'Sheet-Bag-2',
                    parent: { type: 'bag', name: 'ImportBag' },
                  },
                },
              },
            ],
          },
        ],
      },
      undefined
    )

    const papers = await testDb.select().from(paper)
    expect(papers).toHaveLength(2)
    expect(papers.map((p) => p.sublabel).sort()).toEqual(['Spot-Bag', 'Spot-Bag-2'])

    const sheets = await testDb.select().from(sheet)
    expect(sheets.every((s) => s.bagId != null && s.boxId == null)).toBe(true)
  })

  it('micronix_tube: control batch and bulk specimen produce same barcode and plate placement', async () => {
    const study = await createTestStudy(testDb, { title: 'Parity Batch', shortCode: 'PBAT' })
    const { specimenType, loc } = await setupContainerType(testDb, 'micronix_tube', 'BatchBlood')
    const plate = await createTestMicronixPlate(testDb, { name: 'BatchPlate', locationId: loc.id })
    const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'BatchSubj' })
    const definition = await createTestControlDefinition(testDb, { name: 'BatchDef' })

    await createBulkSpecimenRows(testDb, [
      {
        sourceType: 'subject',
        studyShortCode: study.shortCode,
        subjectName: subject.name,
        specimenTypeName: specimenType.name,
        collectionDate: '2025-06-01',
        container: {
          containerType: 'micronix_tube',
          barcode: 'BATCH-PARITY-1',
          collection: { type: 'micronix_plate', name: plate.name, position: 'C1' },
        },
      },
    ])

    await createBatchWithSpecimens(testDb, {
      batch: { controlDefinitionId: definition.id, name: 'BatchParity' },
      specimens: [
        {
          specimenTypeName: specimenType.name,
          containers: [
            {
              containerType: 'micronix_tube',
              barcode: 'BATCH-PARITY-2',
              collection: { type: 'micronix_plate', id: plate.id, position: 'D1' },
            },
          ],
        },
      ],
    })

    const tubes = await testDb
      .select()
      .from(micronixTube)
      .where(eq(micronixTube.collectionId, plate.id))
    expect(tubes.map((t) => t.barcode).sort()).toEqual(['BATCH-PARITY-1', 'BATCH-PARITY-2'])
    expect(tubes.find((t) => t.barcode === 'BATCH-PARITY-1')?.position).toBe('C01')
    expect(tubes.find((t) => t.barcode === 'BATCH-PARITY-2')?.position).toBe('D01')
  })
})
