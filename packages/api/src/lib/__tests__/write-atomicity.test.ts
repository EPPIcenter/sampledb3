import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestSpecimenType,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestUnit,
  createTestBox,
  createTestSheet,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import { runBulkCombinedImport } from '../bulk-combined-import'
import { moveSheetsToCollection, SheetNameConflictError, SheetNotFoundError } from '../collections/sheet-move'
import {
  specimenTypeContainerType,
  containerTypeUnit,
  studySubject,
  specimen,
  storageContainer,
  sheet,
} from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'

// Drizzle's bun-sqlite db.transaction(async ...) commits at the first await, so these
// paths use withWriteTransaction. Each test fails partway through and expects nothing written.
describe('multi-step writes roll back on failure', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  async function setupMicronixPlate() {
    const study = await createTestStudy(testDb, { title: 'Study 1', shortCode: 'ST1' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'DNA' })
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: loc.id })
    const now = utcNow()
    await testDb.insert(specimenTypeContainerType).values({
      specimenTypeId: specimenType.id,
      containerType: 'micronix_tube',
      created: now,
      lastUpdated: now,
    })
    await setContainerDefaults(testDb, {
      micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
    })
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
    return { study, specimenType, loc, plate }
  }

  it('full_file combined import leaves no rows when a later subject fails', async () => {
    const { study, specimenType, plate } = await setupMicronixPlate()
    const specimenAt = (barcode: string) => [
      {
        specimenTypeName: specimenType.name,
        collectionDate: '2024-01-15',
        container: {
          containerType: 'micronix_tube' as const,
          barcode,
          collection: { type: 'micronix_plate' as const, name: plate.name, position: 'A01' },
        },
      },
    ]

    await expect(
      runBulkCombinedImport(
        testDb,
        {
          studyShortCode: study.shortCode,
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'A', specimens: specimenAt('TUBE-A') },
            { subjectName: 'B', specimens: specimenAt('TUBE-B') },
          ],
        },
        undefined
      )
    ).rejects.toThrow(/Subject 'B'/)

    expect(await testDb.select().from(studySubject).all()).toHaveLength(0)
    expect(await testDb.select().from(specimen).all()).toHaveLength(0)
    expect(await testDb.select().from(storageContainer).all()).toHaveLength(0)
  })

  it('sheet move leaves every sheet in place when one sheet id is missing', async () => {
    const { loc } = await setupMicronixPlate()
    const boxA = await createTestBox(testDb, { name: 'BoxA', locationId: loc.id })
    const boxB = await createTestBox(testDb, { name: 'BoxB', locationId: loc.id })
    const s1 = await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxA.id })

    await expect(moveSheetsToCollection(testDb, [s1.id, 99999], boxB.id, 'box')).rejects.toBeInstanceOf(
      SheetNotFoundError
    )

    const [after] = await testDb.select().from(sheet).where(eq(sheet.id, s1.id))
    expect(after.boxId).toBe(boxA.id)
  })

  it('sheet move refuses a name that already exists in the target box', async () => {
    const { loc } = await setupMicronixPlate()
    const boxA = await createTestBox(testDb, { name: 'BoxA', locationId: loc.id })
    const boxB = await createTestBox(testDb, { name: 'BoxB', locationId: loc.id })
    const moving = await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxA.id })
    await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxB.id })

    await expect(moveSheetsToCollection(testDb, [moving.id], boxB.id, 'box')).rejects.toBeInstanceOf(SheetNameConflictError)
  })

  it('sheet move gives the name conflict, not a constraint error, to the losing side of a race', async () => {
    const { loc } = await setupMicronixPlate()
    const [boxA, boxB, target] = await Promise.all(
      ['BoxA', 'BoxB', 'Target'].map((name) => createTestBox(testDb, { name, locationId: loc.id })),
    )
    const fromA = await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxA.id })
    const fromB = await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxB.id })

    const results = await Promise.allSettled([
      moveSheetsToCollection(testDb, [fromA.id], target.id, 'box'),
      moveSheetsToCollection(testDb, [fromB.id], target.id, 'box'),
    ])

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(SheetNameConflictError)
  })
})
