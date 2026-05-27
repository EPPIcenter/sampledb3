import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import {
  formatLocationPath,
  resolveContainerPlacements,
  resolveContainerPlacementBundle,
  resolveContainerSubtypeDetails,
  resolveContainerTypes,
} from '../container-placement'
import type { Database } from '../../db/client'
import {
  bag,
  box,
  cryovialBox,
  cryovialTube,
  micronixTube,
  paper,
  sheet,
  staticWell,
  storageContainer,
} from '../../db/schema'
import { utcNow } from '../datetime'

describe('formatLocationPath', () => {
  it('returns materialized path when present', () => {
    expect(formatLocationPath({ path: 'Lab > Freezer' })).toBe('Lab > Freezer')
    expect(formatLocationPath({ locationPath: 'Lab > Freezer' })).toBe('Lab > Freezer')
  })

  it('appends parent collection name with arrow', () => {
    expect(formatLocationPath({ path: 'Lab' }, 'Plate A')).toBe('Lab → Plate A')
  })

  it('falls back to location name then parent name', () => {
    expect(formatLocationPath({ locationName: 'Room 1' }, 'Box 2')).toBe('Room 1 → Box 2')
    expect(formatLocationPath(null, 'Orphan')).toBe('Orphan')
    expect(formatLocationPath(undefined)).toBeUndefined()
  })
})

describe('resolveContainerPlacements', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  async function createContainer() {
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const now = utcNow()
    const [container] = await testDb
      .insert(storageContainer)
      .values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1,
        remainingQuantity: 1,
        created: now,
        lastUpdated: now,
      })
      .returning()
    return container!
  }

  it('returns empty map for no ids', async () => {
    const map = await resolveContainerPlacements(testDb, [])
    expect(map.size).toBe(0)
  })

  it('returns unknown placement for orphan storage container', async () => {
    const container = await createContainer()
    const map = await resolveContainerPlacements(testDb, [container.id])
    expect(map.get(container.id)).toMatchObject({
      containerType: 'unknown',
      collection: null,
      location: null,
      parentCollection: null,
    })
  })

  it('resolves micronix tube in plate at location', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Lab Freezer',
      storageTypeId: String(storageType.id),
      path: 'Lab > Freezer',
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate A', locationId: loc.id })
    const container = await createContainer()
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-1',
      position: 'A01',
    })

    const map = await resolveContainerPlacements(testDb, [container.id])
    expect(map.get(container.id)).toMatchObject({
      containerType: 'micronix_tube',
      collection: {
        type: 'micronix_plate',
        id: plate.id,
        name: 'Plate A',
        position: 'A01',
      },
      location: {
        id: loc.id,
        name: 'Lab Freezer',
        path: 'Lab > Freezer',
      },
      parentCollection: null,
      locationPath: 'Lab > Freezer',
    })
  })

  it('resolves cryovial tube in box at location', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Cold Room',
      storageTypeId: String(storageType.id),
      path: 'Cold Room',
    })
    const now = utcNow()
    const [cryoBox] = await testDb
      .insert(cryovialBox)
      .values({ name: 'Cryo Box 1', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    const container = await createContainer()
    await testDb.insert(cryovialTube).values({
      id: container.id,
      collectionId: cryoBox!.id,
      position: 'R01',
      barcode: 'CV-1',
    })

    const map = await resolveContainerPlacements(testDb, [container.id])
    expect(map.get(container.id)).toMatchObject({
      containerType: 'cryovial_tube',
      collection: {
        type: 'cryovial_box',
        id: cryoBox!.id,
        name: 'Cryo Box 1',
        position: 'R01',
      },
      locationPath: 'Cold Room',
    })
  })

  it('resolves static well on micronix plate', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Shelf',
      storageTypeId: String(storageType.id),
      path: 'Shelf',
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'QC Plate', locationId: loc.id })
    const container = await createContainer()
    await testDb.insert(staticWell).values({
      id: container.id,
      collectionId: plate.id,
      position: 'H12',
    })

    const map = await resolveContainerPlacements(testDb, [container.id])
    expect(map.get(container.id)).toMatchObject({
      containerType: 'static_well',
      collection: {
        type: 'micronix_plate',
        id: plate.id,
        name: 'QC Plate',
        position: 'H12',
      },
      locationPath: 'Shelf',
    })
  })

  it('resolves paper on sheet with box parent location', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Room' })
    const loc = await createTestLocation(testDb, {
      name: 'Storage Room',
      storageTypeId: String(storageType.id),
      path: 'Building > Room',
    })
    const now = utcNow()
    const [parentBox] = await testDb
      .insert(box)
      .values({ name: 'Paper Box', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    const [parentSheet] = await testDb
      .insert(sheet)
      .values({ name: 'Sheet 1', boxId: parentBox!.id, created: now, lastUpdated: now })
      .returning()
    const container = await createContainer()
    await testDb.insert(paper).values({
      id: container.id,
      sheetId: parentSheet!.id,
      position: 'S01',
      barcode: 'P-1',
    })

    const map = await resolveContainerPlacements(testDb, [container.id])
    expect(map.get(container.id)).toMatchObject({
      containerType: 'paper',
      collection: {
        type: 'sheet',
        id: parentSheet!.id,
        name: 'Sheet 1',
        position: 'S01',
      },
      parentCollection: {
        type: 'box',
        id: parentBox!.id,
        name: 'Paper Box',
      },
      locationPath: 'Building > Room → Paper Box',
    })
  })

  it('resolves paper on sheet with bag parent location', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Room' })
    const loc = await createTestLocation(testDb, {
      name: 'Archive',
      storageTypeId: String(storageType.id),
      path: 'Archive',
    })
    const now = utcNow()
    const [parentBag] = await testDb
      .insert(bag)
      .values({ name: 'Paper Bag', locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    const [parentSheet] = await testDb
      .insert(sheet)
      .values({ name: 'Sheet 2', bagId: parentBag!.id, created: now, lastUpdated: now })
      .returning()
    const container = await createContainer()
    await testDb.insert(paper).values({
      id: container.id,
      sheetId: parentSheet!.id,
      position: 'S02',
    })

    const map = await resolveContainerPlacements(testDb, [container.id])
    expect(map.get(container.id)).toMatchObject({
      containerType: 'paper',
      parentCollection: {
        type: 'bag',
        id: parentBag!.id,
        name: 'Paper Bag',
      },
      locationPath: 'Archive → Paper Bag',
    })
  })

  it('returns one entry per requested id in a mixed batch', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Lab',
      storageTypeId: String(storageType.id),
      path: 'Lab',
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Mixed Plate', locationId: loc.id })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Mixed Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const unit = await createTestUnit(testDb, { symbol: 'spots', name: 'spots', category: 'count' })
    const now = utcNow()
    const [micronixContainer] = await testDb
      .insert(storageContainer)
      .values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1,
        remainingQuantity: 1,
        created: now,
        lastUpdated: now,
      })
      .returning()
    const [orphanContainer] = await testDb
      .insert(storageContainer)
      .values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1,
        remainingQuantity: 1,
        created: now,
        lastUpdated: now,
      })
      .returning()
    await testDb.insert(micronixTube).values({
      id: micronixContainer!.id,
      collectionId: plate.id,
      position: 'A01',
      barcode: 'MX-MIXED',
    })

    const map = await resolveContainerPlacements(testDb, [micronixContainer!.id, orphanContainer!.id])
    expect(map.size).toBe(2)
    expect(map.get(micronixContainer!.id)?.containerType).toBe('micronix_tube')
    expect(map.get(orphanContainer!.id)?.containerType).toBe('unknown')
  })

  it('resolveContainerSubtypeDetails returns barcode and parent ids', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Lab',
      storageTypeId: String(storageType.id),
      path: 'Lab',
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Subtype Plate', locationId: loc.id })
    const container = await createContainer()
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-SUB',
      position: 'C01',
    })

    const { micronixById } = await resolveContainerSubtypeDetails(testDb, [container.id])
    expect(micronixById.get(container.id)).toMatchObject({
      barcode: 'MX-SUB',
      position: 'C01',
      plateId: plate.id,
      plateName: 'Subtype Plate',
      locationId: loc.id,
    })
  })

  it('resolveContainerPlacementBundle returns placements and subtypes together', async () => {
    const container = await createContainer()
    const bundle = await resolveContainerPlacementBundle(testDb, [container.id])
    expect(bundle.placements.get(container.id)?.containerType).toBe('unknown')
    expect(bundle.subtypes.micronixById.size).toBe(0)
  })

  it('resolveContainerTypes returns subtype map derived from placements', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Lab',
      storageTypeId: String(storageType.id),
      path: 'Lab',
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Type Plate', locationId: loc.id })
    const container = await createContainer()
    await testDb.insert(micronixTube).values({
      id: container.id,
      collectionId: plate.id,
      barcode: 'MX-TYPE',
      position: 'B01',
    })

    const types = await resolveContainerTypes(testDb, [container.id, 99999])
    expect(types.get(container.id)).toBe('micronix_tube')
    expect(types.get(99999)).toBe('unknown')
  })
})
