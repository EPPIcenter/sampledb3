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
} from '../../db/schema'
import { utcNow } from '../datetime'
import { createBulkSpecimenRows } from '../registration-orchestrator'
import { runBulkCombinedImport } from '../bulk-combined-import'

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
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
    clearSettingsCache()
    clearDefaultsCache(testDb)
  })

  afterEach(() => {
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
          collectionName: plate.name,
          barcode: 'MIC-PARITY-1',
          position: 'A1',
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
                  collectionName: plate.name,
                  barcode: 'MIC-PARITY-2',
                  position: 'B1',
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
          collectionName: boxRecord.name,
          barcode: 'CRY-PARITY-1',
          position: 'C1',
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
                  collectionName: boxRecord.name,
                  barcode: 'CRY-PARITY-2',
                  position: 'D1',
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
                  collectionName: plate.name,
                  position: 'E1',
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

  it('paper: bulk specimen creates paper at sheet label', async () => {
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
          collectionName: boxRecord.name,
          label: 'Spot-A',
        },
      },
    ])

    const paperRecord = await testDb.select().from(paper).get()
    expect(paperRecord).toBeDefined()
  })
})
