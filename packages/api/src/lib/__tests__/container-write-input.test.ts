import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { ContainerWriteInput } from '@sampledb/contract'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import {
  createTestSpecimenType,
  createTestStorageType,
  createTestLocation,
  createTestUnit,
  createTestMicronixPlate,
  createTestControlDefinition,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import {
  specimenTypeContainerType,
  containerTypeUnit,
  controlBatch,
  box,
  bag,
  sheet,
  specimen,
  micronixTube,
  paper as paperTable,
} from '../../db/schema'
import { utcNow } from '../datetime'
import { createContainerForSpecimen } from '../container-creation'

async function setupPaperSpecimen(testDb: Database) {
  const unit = await createTestUnit(testDb, { symbol: 'spots', name: 'DBS spots', category: 'count' })
  await setContainerDefaults(testDb, {
    paper: { totalQuantity: 100, remainingQuantity: 100, defaultUnitSymbol: 'spots' },
    micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
    cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
    static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
  })
  await testDb.insert(containerTypeUnit).values({ containerType: 'paper', unitId: unit.id })

  const specType = await createTestSpecimenType(testDb, { name: 'DBS' })
  const now = utcNow()
  await testDb.insert(specimenTypeContainerType).values({
    specimenTypeId: specType.id,
    containerType: 'paper',
    created: now,
  })

  const definition = await createTestControlDefinition(testDb, { name: 'DefWrite' })
  const [batch] = await testDb
    .insert(controlBatch)
    .values({
      controlDefinitionId: definition.id,
      name: 'Batch-Write',
      created: now,
      lastUpdated: now,
    })
    .returning()

  const [spec] = await testDb
    .insert(specimen)
    .values({
      specimenTypeId: specType.id,
      controlBatchId: batch.id,
      collectionDate: '2026-06-01',
    })
    .returning()

  const storageType = await createTestStorageType(testDb, { name: 'Room Temp' })
  const loc = await createTestLocation(testDb, {
    name: 'Storage',
    storageTypeId: String(storageType.id),
    canContainCollections: true,
  })

  return { spec, specType, batch, loc, now }
}

describe('createContainerForSpecimen with ContainerWriteInput', () => {
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

  it('creates micronix tube from ContainerWriteInput on existing plate', async () => {
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    await setContainerDefaults(testDb, {
      micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      paper: { totalQuantity: 100, remainingQuantity: 100, defaultUnitSymbol: 'uL' },
    })
    await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })

    const specType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
    const now = utcNow()
    await testDb.insert(specimenTypeContainerType).values({
      specimenTypeId: specType.id,
      containerType: 'micronix_tube',
      created: now,
    })

    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'WritePlate', locationId: loc.id })

    const definition = await createTestControlDefinition(testDb, { name: 'DefMic' })
    const [batch] = await testDb
      .insert(controlBatch)
      .values({
        controlDefinitionId: definition.id,
        name: 'Batch-Mic',
        created: now,
        lastUpdated: now,
      })
      .returning()

    const [spec] = await testDb
      .insert(specimen)
      .values({
        specimenTypeId: specType.id,
        controlBatchId: batch.id,
        collectionDate: '2026-06-01',
      })
      .returning()

    const writeInput: ContainerWriteInput = {
      containerType: 'micronix_tube',
      barcode: 'WRITE-MIC-1',
      collection: {
        type: 'micronix_plate',
        id: plate.id,
        name: plate.name,
        position: 'A1',
      },
    }

    const result = await createContainerForSpecimen(spec.id, writeInput, testDb)
    expect(result.success).toBe(true)

    const tube = await testDb
      .select()
      .from(micronixTube)
      .where(eq(micronixTube.barcode, 'WRITE-MIC-1'))
      .get()
    expect(tube?.collectionId).toBe(plate.id)
    expect(tube?.position).toBe('A01')
  })

  it('creates paper container with bag parent from ContainerWriteInput', async () => {
    const { spec, loc, now } = await setupPaperSpecimen(testDb)

    const writeInput: ContainerWriteInput = {
      containerType: 'paper',
      sublabel: 'Spot-Bag',
      collection: {
        type: 'sheet',
        name: 'Sheet-Bag',
        parent: { type: 'bag', name: 'ImportBag', locationId: loc.id },
      },
    }

    const result = await createContainerForSpecimen(spec.id, writeInput, testDb)
    expect(result.success).toBe(true)

    const bagRecord = await testDb.select().from(bag).where(eq(bag.name, 'ImportBag')).get()
    expect(bagRecord).toBeDefined()

    const sheetRecord = await testDb
      .select()
      .from(sheet)
      .where(eq(sheet.name, 'Sheet-Bag'))
      .get()
    expect(sheetRecord?.bagId).toBe(bagRecord!.id)

    const paperRecord = await testDb.select().from(paperTable).get()
    expect(paperRecord?.sublabel).toBe('Spot-Bag')
    expect(paperRecord?.sheetId).toBe(sheetRecord!.id)
  })

  it('legacy flat ContainerData and ContainerWriteInput produce equivalent paper rows', async () => {
    const { spec, specType, batch, loc, now } = await setupPaperSpecimen(testDb)

    const [boxRecord] = await testDb
      .insert(box)
      .values({ name: 'ParityBox', locationId: loc.id, created: now, lastUpdated: now })
      .returning()

    const [spec2] = await testDb
      .insert(specimen)
      .values({
        specimenTypeId: specType.id,
        controlBatchId: batch.id,
        collectionDate: '2026-06-02',
      })
      .returning()

    const legacyResult = await createContainerForSpecimen(
      spec.id,
      {
        containerType: 'paper',
        collectionName: boxRecord.name,
        sheetName: 'Sheet-Legacy',
        sublabel: 'Spot-Legacy',
      },
      testDb,
    )
    expect(legacyResult.success).toBe(true)

    const writeResult = await createContainerForSpecimen(
      spec2.id,
      {
        containerType: 'paper',
        sublabel: 'Spot-Write',
        collection: {
          type: 'sheet',
          name: 'Sheet-Write',
          parent: { type: 'box', name: boxRecord.name },
        },
      },
      testDb,
    )
    expect(writeResult.success).toBe(true)

    const legacyPaper = await testDb
      .select()
      .from(paperTable)
      .where(eq(paperTable.id, legacyResult.containerId!))
      .get()
    const writePaper = await testDb
      .select()
      .from(paperTable)
      .where(eq(paperTable.id, writeResult.containerId!))
      .get()

    expect(legacyPaper?.sublabel).toBe('Spot-Legacy')
    expect(writePaper?.sublabel).toBe('Spot-Write')

    const legacySheet = await testDb.select().from(sheet).where(eq(sheet.id, legacyPaper!.sheetId)).get()
    const writeSheet = await testDb.select().from(sheet).where(eq(sheet.id, writePaper!.sheetId)).get()
    expect(legacySheet?.boxId).toBe(boxRecord.id)
    expect(writeSheet?.boxId).toBe(boxRecord.id)
  })
})
