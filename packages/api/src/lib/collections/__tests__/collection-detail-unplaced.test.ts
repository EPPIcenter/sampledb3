import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestCryovialBox,
  createTestCryovialTube,
  createTestLocation,
  createTestMicronixPlate,
  createTestMicronixTube,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { getCryovialBoxDetail, getMicronixPlateDetail } from '../collection-detail'

describe('collection detail with unplaced Containers', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let locationId: number
  let containerOptions: { specimenId: number; unitId: number }

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Freezer',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    locationId = loc.id
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    containerOptions = { specimenId: specimen.id, unitId: unit.id }
  })

  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  async function addPlateTube(plateId: number, barcode: string, position: string | null) {
    const container = await createTestStorageContainer(testDb, containerOptions)
    await createTestMicronixTube(testDb, { containerId: container.id, collectionId: plateId, barcode, position })
    return container.id
  }

  async function addBoxTube(boxId: number, barcode: string, position: string | null) {
    const container = await createTestStorageContainer(testDb, containerOptions)
    await createTestCryovialTube(testDb, { containerId: container.id, collectionId: boxId, barcode, position })
    return container.id
  }

  it('lists plate tubes without a grid position separately from placed tubes', async () => {
    const plate = await createTestMicronixPlate(testDb, { name: 'P-unplaced', locationId })
    const placedId = await addPlateTube(plate.id, 'MX-PLACED', 'B07')
    await addPlateTube(plate.id, 'MX-NULL-2', null)
    await addPlateTube(plate.id, 'MX-NULL-1', null)
    await addPlateTube(plate.id, 'MX-NULL-3', null)

    const detail = await getMicronixPlateDetail(testDb, plate.id)

    expect(Object.keys(detail!.wells)).toEqual(['B07'])
    expect(detail!.wells.B07!.id).toBe(placedId)
    expect(detail!.unplaced.map((e) => e.barcode)).toEqual(['MX-NULL-1', 'MX-NULL-2', 'MX-NULL-3'])
    expect(detail!.unplaced.every((e) => e.position === null)).toBe(true)
    expect(detail!.unplaced.every((e) => e.container != null)).toBe(true)
  })

  it('keeps stored plate positions that are not grid cells as unplaced with their stored value', async () => {
    const plate = await createTestMicronixPlate(testDb, { name: 'P-invalid', locationId })
    await addPlateTube(plate.id, 'MX-A1', 'a1')
    await addPlateTube(plate.id, 'MX-BARCODE-POS', 'A1145868849')
    await addPlateTube(plate.id, 'MX-ROW-I', 'I01')
    await addPlateTube(plate.id, 'MX-COL-13', 'A13')

    const detail = await getMicronixPlateDetail(testDb, plate.id)

    expect(Object.keys(detail!.wells)).toEqual(['A01'])
    expect(detail!.wells.A01!.barcode).toBe('MX-A1')
    expect(detail!.unplaced.map((e) => [e.position, e.barcode])).toEqual([
      ['A13', 'MX-COL-13'],
      ['A1145868849', 'MX-BARCODE-POS'],
      ['I01', 'MX-ROW-I'],
    ])
  })

  it('lists a second plate tube normalizing to an occupied cell as unplaced instead of dropping it', async () => {
    const plate = await createTestMicronixPlate(testDb, { name: 'P-dup', locationId })
    await addPlateTube(plate.id, 'MX-FIRST', 'C03')
    await addPlateTube(plate.id, 'MX-SECOND', 'c3')

    const detail = await getMicronixPlateDetail(testDb, plate.id)

    expect(detail!.wells.C03!.barcode).toBe('MX-FIRST')
    expect(detail!.unplaced.map((e) => e.barcode)).toEqual(['MX-SECOND'])
  })

  it('returns an empty unplaced list when every plate tube has a grid cell', async () => {
    const plate = await createTestMicronixPlate(testDb, { name: 'P-full', locationId })
    await addPlateTube(plate.id, 'MX-1', 'A01')

    const detail = await getMicronixPlateDetail(testDb, plate.id)

    expect(detail!.unplaced).toEqual([])
  })

  it('lists cryovial tubes with missing or non-grid positions as unplaced, keeping the stored value', async () => {
    const box = await createTestCryovialBox(testDb, { name: 'B-unplaced', locationId })
    await addBoxTube(box.id, 'CV-B7', 'B7')
    await addBoxTube(box.id, 'CV-J10', 'J10')
    await addBoxTube(box.id, 'CV-NULL', null)
    await addBoxTube(box.id, 'CV-DASH', '--A01')
    await addBoxTube(box.id, 'CV-NA', 'NA01')
    await addBoxTube(box.id, 'CV-K', 'K01')
    await addBoxTube(box.id, 'CV-COL11', 'A11')

    const detail = await getCryovialBoxDetail(testDb, box.id)

    expect(Object.keys(detail!.positions).sort()).toEqual(['B07', 'J10'])
    expect(detail!.positions.B07!.map((e) => e.barcode)).toEqual(['CV-B7'])
    expect(detail!.unplaced.map((e) => [e.position, e.barcode])).toEqual([
      ['--A01', 'CV-DASH'],
      ['A11', 'CV-COL11'],
      ['K01', 'CV-K'],
      ['NA01', 'CV-NA'],
      [null, 'CV-NULL'],
    ])
  })
})
