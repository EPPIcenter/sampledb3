import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestSpecimenType,
  createTestSpecimen,
  createTestUnit,
  createTestBox,
  createTestSheet,
  createTestStorageContainer,
  createTestPaper,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestMicronixTube,
} from '../../__tests__/helpers/factories'
import { resolveContainerByBarcode } from '../identifier-resolution'
import {
  resolveContainerByPosition,
  resolveContainerByIdentifier,
  inferCollectionTypeFromContainers,
  executeMoves,
  type ContainerInfo,
} from '../container-move'
import { storageContainer } from '../../db/schema'
import { micronixTube, cryovialTube, staticWell, paper } from '../../db/schema'
import type { Database } from '../../db/client'
import { utcNow } from '../datetime'
import { createTestUser } from '../../__tests__/helpers/auth-helpers'
import { eq } from 'drizzle-orm'

describe('container-move', () => {
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

  describe('inferCollectionTypeFromContainers', () => {
    it('returns valid: false when no containers', () => {
      const result = inferCollectionTypeFromContainers([])
      expect(result.valid).toBe(false)
      expect(result.collectionType).toBeNull()
      expect(result.error).toContain('No containers')
    })

    it('returns valid: false when containers have no collection type', () => {
      const result = inferCollectionTypeFromContainers([
        { containerId: 1, containerType: 'micronix_tube', currentCollectionId: null, currentCollectionName: null, currentCollectionType: null, currentPosition: 'A01' },
      ])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('No containers have collection types')
    })

    it('returns valid: true and collectionType when single type', () => {
      const result = inferCollectionTypeFromContainers([
        { containerId: 1, containerType: 'micronix_tube', currentCollectionId: 1, currentCollectionName: 'P1', currentCollectionType: 'micronix_plate', currentPosition: 'A01' },
      ])
      expect(result.valid).toBe(true)
      expect(result.collectionType).toBe('micronix_plate')
    })

    it('returns valid: false when mixed collection types', () => {
      const result = inferCollectionTypeFromContainers([
        { containerId: 1, containerType: 'micronix_tube', currentCollectionId: 1, currentCollectionName: 'P1', currentCollectionType: 'micronix_plate', currentPosition: 'A01' },
        { containerId: 2, containerType: 'cryovial_tube', currentCollectionId: 2, currentCollectionName: 'B1', currentCollectionType: 'cryovial_box', currentPosition: 'A02' },
      ])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Mixed collection types')
    })
  })

  describe('resolveContainerByPosition', () => {
    it('returns null when collection does not exist', async () => {
      const result = await resolveContainerByPosition(testDb, 'NonExistentPlate', 'micronix_plate', 'A01')
      expect(result).toBeNull()
    })

    it('returns container info when micronix tube exists at position', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: container!.id,
        collectionId: plate.id,
        barcode: 'MT001',
        position: 'A01',
      })

      const result = await resolveContainerByPosition(testDb, 'Plate1', 'micronix_plate', 'A01')
      expect(result).not.toBeNull()
      expect(result!.containerId).toBe(container!.id)
      expect(result!.containerType).toBe('micronix_tube')
      expect(result!.currentCollectionName).toBe('Plate1')
      expect(result!.currentPosition).toBe('A01')
      expect(result!.barcode).toBe('MT001')
    })
  })

  describe('resolveContainerByBarcode', () => {
    it('returns null when barcode does not exist', async () => {
      const result = await resolveContainerByBarcode(testDb, 'NONEXISTENT')
      expect(result).toBeNull()
    })

    it('returns container info when micronix tube with barcode exists', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: container!.id,
        collectionId: plate.id,
        barcode: 'MT-BARCODE-001',
        position: 'A01',
      })

      const result = await resolveContainerByBarcode(testDb, 'MT-BARCODE-001')
      expect(result).not.toBeNull()
      expect(result!.barcode).toBe('MT-BARCODE-001')
      expect(result!.containerType).toBe('micronix_tube')
    })
  })

  describe('resolveContainerByIdentifier', () => {
    it('returns null for barcode identifier when barcode not found', async () => {
      const result = await resolveContainerByIdentifier(testDb, { type: 'barcode', barcode: 'NOTFOUND' })
      expect(result).toBeNull()
    })

    it('returns container for container_id when container exists', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: container!.id,
        collectionId: plate.id,
        barcode: 'MT002',
        position: 'B02',
      })

      const result = await resolveContainerByIdentifier(testDb, { type: 'container_id', containerId: container!.id })
      expect(result).not.toBeNull()
      expect(result!.containerId).toBe(container!.id)
    })
  })

  describe('executeMoves', () => {
    it('returns success: false when no moves provided and mappings are empty', async () => {
      const result = await executeMoves(testDb, { mappings: [], moves: [] })
      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      expect(result.errors).toBeDefined()
    })

    it('returns error when moves reference non-existent containers', async () => {
      const result = await executeMoves(testDb, {
        mappings: [],
        moves: [{ identifier: { type: 'barcode', barcode: 'NO_SUCH_BARCODE' }, targetPosition: 'A01' }],
      })
      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
    })

    it('swaps two micronix tubes on the same plate in one batch', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'FreezerSwap' })
      const location = await createTestLocation(testDb, { name: 'LocSwap', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'SwapPlate', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'BloodSwap' })
      const specimenA = await createTestSpecimen(testDb, specimenType.id)
      const specimenB = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()

      const [containerA] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimenA.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      const [containerB] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimenB.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(micronixTube).values({
        id: containerA!.id,
        collectionId: plate.id,
        barcode: 'MT-SWAP-A',
        position: 'A01',
      })
      await testDb.insert(micronixTube).values({
        id: containerB!.id,
        collectionId: plate.id,
        barcode: 'MT-SWAP-B',
        position: 'A02',
      })

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: 'SwapPlate', toCollectionName: 'SwapPlate' }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-SWAP-A' }, targetPosition: 'A02' },
          { identifier: { type: 'barcode', barcode: 'MT-SWAP-B' }, targetPosition: 'A01' },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.moved).toBe(2)

      const atA01 = await resolveContainerByPosition(testDb, 'SwapPlate', 'micronix_plate', 'A01')
      const atA02 = await resolveContainerByPosition(testDb, 'SwapPlate', 'micronix_plate', 'A02')
      expect(atA01?.barcode).toBe('MT-SWAP-B')
      expect(atA02?.barcode).toBe('MT-SWAP-A')
    })

    it('moves micronix tube to new position within same plate', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'MovePlate', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: container!.id,
        collectionId: plate.id,
        barcode: 'MT-MOVE-001',
        position: 'A01',
      })

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: 'MovePlate', toCollectionName: 'MovePlate' }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-MOVE-001' }, targetPosition: 'A02' },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.moved).toBe(1)

      const after = await resolveContainerByPosition(testDb, 'MovePlate', 'micronix_plate', 'A02')
      expect(after).not.toBeNull()
      expect(after!.currentPosition).toBe('A02')
      expect(after!.barcode).toBe('MT-MOVE-001')
    })

    it('rejects conflicting target positions and does not move any containers', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'LocConflict', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'ConflictPlate', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimenA = await createTestSpecimen(testDb, specimenType.id)
      const specimenB = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()

      const [containerA] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimenA.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      const [containerB] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimenB.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()

      await testDb.insert(micronixTube).values({
        id: containerA!.id,
        collectionId: plate.id,
        barcode: 'MT-COLLIDE-001',
        position: 'A01',
      })
      await testDb.insert(micronixTube).values({
        id: containerB!.id,
        collectionId: plate.id,
        barcode: 'MT-COLLIDE-002',
        position: 'A02',
      })

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: 'ConflictPlate', toCollectionName: 'ConflictPlate' }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-COLLIDE-001' }, targetPosition: 'A03' },
          { identifier: { type: 'barcode', barcode: 'MT-COLLIDE-002' }, targetPosition: 'A03' },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      expect(result.errors?.length).toBeGreaterThan(0)

      const afterA01 = await resolveContainerByPosition(testDb, 'ConflictPlate', 'micronix_plate', 'A01')
      const afterA02 = await resolveContainerByPosition(testDb, 'ConflictPlate', 'micronix_plate', 'A02')
      expect(afterA01?.barcode).toBe('MT-COLLIDE-001')
      expect(afterA02?.barcode).toBe('MT-COLLIDE-002')
    })

    it('all_or_nothing mode blocks all moves when any row is invalid', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'FreezerAtomic' })
      const location = await createTestLocation(testDb, { name: 'LocAtomic', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'AtomicPlate', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'BloodAtomic' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: container!.id,
        collectionId: plate.id,
        barcode: 'MT-ATOMIC-001',
        position: 'A01',
      })

      const result = await executeMoves(testDb, {
        atomicMode: 'all_or_nothing',
        mappings: [{ fromCollectionName: 'AtomicPlate', toCollectionName: 'AtomicPlate' }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-ATOMIC-001' }, targetPosition: 'A02' },
          { identifier: { type: 'barcode', barcode: 'MISSING-BARCODE' }, targetPosition: 'B01' },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      expect(result.errors?.length).toBeGreaterThan(0)

      const stillAtA01 = await resolveContainerByPosition(testDb, 'AtomicPlate', 'micronix_plate', 'A01')
      const movedToA02 = await resolveContainerByPosition(testDb, 'AtomicPlate', 'micronix_plate', 'A02')
      expect(stillAtA01?.barcode).toBe('MT-ATOMIC-001')
      expect(movedToA02).toBeNull()
    })

    it('best_effort mode moves valid rows and reports invalid rows', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'FreezerBestEffort' })
      const location = await createTestLocation(testDb, { name: 'LocBestEffort', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'BestEffortPlate', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'BloodBestEffort' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()

      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: specimen.id,
          unitId: unit.id,
          totalQuantity: 1.0,
          remainingQuantity: 1.0,
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(micronixTube).values({
        id: container!.id,
        collectionId: plate.id,
        barcode: 'MT-BESTEFFORT-001',
        position: 'A01',
      })

      const result = await executeMoves(testDb, {
        atomicMode: 'best_effort',
        mappings: [{ fromCollectionName: 'BestEffortPlate', toCollectionName: 'BestEffortPlate' }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-BESTEFFORT-001' }, targetPosition: 'A02' },
          { identifier: { type: 'barcode', barcode: 'MISSING-BARCODE' }, targetPosition: 'B01' },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(1)
      expect(result.errors?.some((e) => e.error.includes('Container not found'))).toBe(true)

      const movedToA02 = await resolveContainerByPosition(testDb, 'BestEffortPlate', 'micronix_plate', 'A02')
      expect(movedToA02?.barcode).toBe('MT-BESTEFFORT-001')
    })
  })

  describe('executeMoves with an ambiguous barcode', () => {
    it('fails the row and lists every candidate instead of moving one of them', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'FreezerAmbiguous' })
      const location = await createTestLocation(testDb, { name: 'LocAmbiguous', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'AmbPlate', locationId: location.id })
      const cryoBox = await createTestCryovialBox(testDb, { name: 'AmbBox', locationId: location.id })
      const micronix = await createTestStorageContainer(testDb, {})
      const cryovial = await createTestStorageContainer(testDb, { unitId: micronix.unitId, specimenId: micronix.specimenId })
      const other = await createTestStorageContainer(testDb, { unitId: micronix.unitId, specimenId: micronix.specimenId })
      await createTestMicronixTube(testDb, { containerId: micronix.id, collectionId: plate.id, barcode: 'SHARED', position: 'A01' })
      await createTestCryovialTube(testDb, { containerId: cryovial.id, collectionId: cryoBox.id, barcode: 'SHARED', position: 'A01' })
      await createTestMicronixTube(testDb, { containerId: other.id, collectionId: plate.id, barcode: 'UNIQUE-1', position: 'A02' })

      const result = await executeMoves(testDb, {
        atomicMode: 'best_effort',
        mappings: [{ fromCollectionName: 'AmbPlate', toCollectionName: 'AmbPlate' }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'SHARED' }, targetPosition: 'B01' },
          { identifier: { type: 'barcode', barcode: 'UNIQUE-1' }, targetPosition: 'B02' },
        ],
      })

      expect(result).toEqual({
        success: false,
        moved: 1,
        errors: [
          {
            row: 1,
            error:
              `Ambiguous barcode 'SHARED': it matches 2 containers (container ${micronix.id} (micronix_tube in AmbPlate A01), ` +
              `container ${cryovial.id} (cryovial_tube in AmbBox A01)). Identify the container by its id or position instead.`,
          },
        ],
      })
      expect((await resolveContainerByIdentifier(testDb, { type: 'container_id', containerId: micronix.id }))?.currentPosition).toBe('A01')
      expect((await resolveContainerByIdentifier(testDb, { type: 'container_id', containerId: cryovial.id }))?.currentPosition).toBe('A01')
      // A container id still resolves a tube whose barcode is shared.
      expect((await resolveContainerByIdentifier(testDb, { type: 'container_id', containerId: micronix.id }))?.containerId).toBe(micronix.id)
    })
  })

  describe('position normalization and occupancy', () => {
    async function setupPlate(name = 'NormPlate') {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name, locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const newContainerId = async () => {
        const now = utcNow()
        const [container] = await testDb
          .insert(storageContainer)
          .values({ specimenId: specimen.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
          .returning()
        return container!.id
      }
      const addTube = async (barcode: string, position: string) => {
        const id = await newContainerId()
        await testDb.insert(micronixTube).values({ id, collectionId: plate.id, barcode, position })
        return id
      }
      const addWell = async (position: string) => {
        const id = await newContainerId()
        await testDb.insert(staticWell).values({ id, collectionId: plate.id, position })
        return id
      }
      return { plate, addTube, addWell }
    }

    it('stores a normalized target position and resolves a non-padded source position', async () => {
      const { plate, addTube } = await setupPlate()
      await addTube('MT-NORM-1', 'A01')

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: plate.name, toCollectionName: plate.name }],
        moves: [{ identifier: { type: 'position', sourceCollectionName: plate.name, sourcePosition: 'a1' }, targetPosition: 'b1' }],
      })

      expect(result.success).toBe(true)
      const [tube] = await testDb.select().from(micronixTube).all()
      expect(tube.position).toBe('B01')
    })

    it('treats non-padded and padded targets in one batch as the same cell', async () => {
      const { plate, addTube } = await setupPlate()
      await addTube('MT-DUP-1', 'A01')
      await addTube('MT-DUP-2', 'A02')

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: plate.name, toCollectionName: plate.name }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-DUP-1' }, targetPosition: 'C1' },
          { identifier: { type: 'barcode', barcode: 'MT-DUP-2' }, targetPosition: 'C01' },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
    })

    it('best_effort does not move a container into the cell of one whose move failed', async () => {
      const { plate, addTube, addWell } = await setupPlate()
      await addWell('A01')
      await addTube('MT-Y', 'B01')
      await addTube('MT-T9', 'D01')

      const result = await executeMoves(testDb, {
        atomicMode: 'best_effort',
        mappings: [{ fromCollectionName: plate.name, toCollectionName: plate.name }],
        moves: [
          { identifier: { type: 'position', sourceCollectionName: plate.name, sourcePosition: 'A01' }, targetPosition: 'C01' },
          { identifier: { type: 'barcode', barcode: 'MT-Y' }, targetPosition: 'C01' },
          { identifier: { type: 'barcode', barcode: 'MT-T9' }, targetPosition: 'A01' },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      const [well] = await testDb.select().from(staticWell).all()
      expect(well.position).toBe('A01')
      const tubes = await testDb.select().from(micronixTube).all()
      expect(tubes.find((t) => t.barcode === 'MT-T9')?.position).toBe('D01')
    })

    it.each([
      { target: 'Z99', reason: 'outside' },
      { target: 'I01', reason: 'outside' },
      { target: 'A13', reason: 'outside' },
      { target: 'hello world', reason: 'not a grid position' },
      { target: '--A01', reason: 'not a grid position' },
    ])('rejects a move to $target on a plate and writes nothing', async ({ target, reason }) => {
      const { plate, addTube } = await setupPlate()
      await addTube('MT-OK', 'A01')
      await addTube('MT-BAD', 'A02')

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: plate.name, toCollectionName: plate.name }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-OK' }, targetPosition: 'B01' },
          { identifier: { type: 'barcode', barcode: 'MT-BAD' }, targetPosition: target },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.moved).toBe(0)
      expect(result.errors).toEqual([{ row: 2, error: expect.stringContaining(`"${target}"`) }])
      expect(result.errors?.[0]?.error).toContain(reason)
      const tubes = await testDb.select().from(micronixTube).all()
      expect(tubes.map((t) => [t.barcode, t.position])).toEqual([['MT-OK', 'A01'], ['MT-BAD', 'A02']])
    })

    it('best_effort moves the valid rows and skips an out-of-range one', async () => {
      const { plate, addTube } = await setupPlate()
      await addTube('MT-OK', 'A01')
      await addTube('MT-BAD', 'A02')

      const result = await executeMoves(testDb, {
        atomicMode: 'best_effort',
        mappings: [{ fromCollectionName: plate.name, toCollectionName: plate.name }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-OK' }, targetPosition: 'b1' },
          { identifier: { type: 'barcode', barcode: 'MT-BAD' }, targetPosition: 'H13' },
        ],
      })

      expect(result.moved).toBe(1)
      expect(result.errors).toEqual([{ row: 2, error: expect.stringContaining('"H13" is outside a micronix plate') }])
      const tubes = await testDb.select().from(micronixTube).all()
      expect(tubes.map((t) => [t.barcode, t.position])).toEqual([['MT-OK', 'B01'], ['MT-BAD', 'A02']])
    })

    it('moves on a plate that holds legacy malformed positions, including a legacy tube itself', async () => {
      const { plate, addTube } = await setupPlate()
      await addTube('MT-LEGACY', 'A1145854300')
      await addTube('MT-DASH', '--A01')
      await addTube('MT-NEW', 'B01')

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: plate.name, toCollectionName: plate.name }],
        moves: [
          { identifier: { type: 'barcode', barcode: 'MT-NEW' }, targetPosition: 'A01' },
          { identifier: { type: 'barcode', barcode: 'MT-LEGACY' }, targetPosition: 'c1' },
        ],
      })

      expect(result).toEqual({ success: true, moved: 2 })
      const tubes = await testDb.select().from(micronixTube).all()
      expect(Object.fromEntries(tubes.map((t) => [t.barcode, t.position]))).toEqual({
        'MT-LEGACY': 'C01',
        'MT-DASH': '--A01',
        'MT-NEW': 'A01',
      })
    })

    it('resolves a static well by container_id', async () => {
      const { plate, addWell } = await setupPlate()
      const wellId = await addWell('A01')

      const info = await resolveContainerByIdentifier(testDb, { type: 'container_id', containerId: wellId })
      expect(info?.containerType).toBe('static_well')
      expect(info?.currentCollectionName).toBe(plate.name)
    })
  })

  describe('cryovial box grid positions', () => {
    async function setupBox() {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const box = await createTestCryovialBox(testDb, { name: 'CryoBox', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const container = await createTestStorageContainer(testDb, { specimenId: specimen.id, unitId: unit.id })
      await createTestCryovialTube(testDb, { containerId: container.id, collectionId: box.id, barcode: 'CV-1', position: 'A01' })
      return box
    }

    it.each([
      { target: 'j10', stored: 'J10' },
      { target: 'I9', stored: 'I09' },
    ])('stores $target in a box as $stored', async ({ target, stored }) => {
      const box = await setupBox()
      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: box.name, toCollectionName: box.name }],
        moves: [{ identifier: { type: 'barcode', barcode: 'CV-1' }, targetPosition: target }],
      })
      expect(result).toEqual({ success: true, moved: 1 })
      const [tube] = await testDb.select().from(cryovialTube).all()
      expect(tube.position).toBe(stored)
    })

    it.each(['K01', 'A11', 'H12'])('rejects %s, outside a box', async (target) => {
      const box = await setupBox()
      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: box.name, toCollectionName: box.name }],
        moves: [{ identifier: { type: 'barcode', barcode: 'CV-1' }, targetPosition: target }],
      })
      expect(result.success).toBe(false)
      expect(result.errors).toEqual([{ row: 1, error: `Position "${target}" is outside a cryovial box (A01–J10)` }])
      const [tube] = await testDb.select().from(cryovialTube).all()
      expect(tube.position).toBe('A01')
    })
  })

  describe('paper moves between same-named sheets', () => {
    it('moves papers from Sheet-1 of one box to Sheet-1 of another using parent names', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const boxA = await createTestBox(testDb, { name: 'BA', locationId: location.id })
      const boxB = await createTestBox(testDb, { name: 'BB', locationId: location.id })
      const sheetA = await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxA.id })
      const sheetB = await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxB.id })
      const container = await createTestStorageContainer(testDb, { specimenId: specimen.id, unitId: unit.id })
      await createTestPaper(testDb, { containerId: container.id, sheetId: sheetB.id })

      const ambiguous = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: 'Sheet-1', toCollectionName: 'Sheet-1' }],
        moves: [{ identifier: { type: 'container_id', containerId: container!.id }, targetPosition: '' }],
      })
      expect(ambiguous.success).toBe(false)
      expect(ambiguous.errors?.[0].error).toMatch(/set toParentName/)

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: 'Sheet-1', fromParentName: 'BB', toCollectionName: 'Sheet-1', toParentName: 'BA' }],
        moves: [{ identifier: { type: 'container_id', containerId: container!.id }, targetPosition: '' }],
      })
      expect(result.success).toBe(true)
      const [moved] = await testDb.select().from(paper).all()
      expect(moved.sheetId).toBe(sheetA.id)
    })

    /** Boxes BA, BB, BC; Sheet-1 in BA and BB, Only-Sheet in BA, Dest in BC; one paper on BA's Sheet-1. */
    async function seedSheets() {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const [boxA, boxB, boxC] = await Promise.all(
        ['BA', 'BB', 'BC'].map((name) => createTestBox(testDb, { name, locationId: location.id })),
      )
      const sheetA = await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxA.id })
      await createTestSheet(testDb, { name: 'Sheet-1', boxId: boxB.id })
      const onlySheet = await createTestSheet(testDb, { name: 'Only-Sheet', boxId: boxA.id })
      const dest = await createTestSheet(testDb, { name: 'Dest', boxId: boxC.id })
      const container = await createTestStorageContainer(testDb)
      await createTestPaper(testDb, { containerId: container.id, sheetId: sheetA.id })
      return { container, sheetA, onlySheet, dest }
    }

    it('reports a source sheet name shared by several sheets instead of moving from all of them', async () => {
      const { container, sheetA } = await seedSheets()

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: 'Sheet-1', toCollectionName: 'Dest' }],
        moves: [{ identifier: { type: 'container_id', containerId: container.id }, targetPosition: '' }],
      })

      expect(result.success).toBe(false)
      expect(result.errors?.[0].error).toMatch(/Source sheet "Sheet-1" matches 2 sheets; set fromParentName/)
      const [unmoved] = await testDb.select().from(paper).all()
      expect(unmoved.sheetId).toBe(sheetA.id)
    })

    it('resolves sheet names without parent names when each matches one sheet', async () => {
      const { container, onlySheet, dest } = await seedSheets()
      await testDb.update(paper).set({ sheetId: onlySheet.id }).run()

      const result = await executeMoves(testDb, {
        mappings: [{ fromCollectionName: 'Only-Sheet', toCollectionName: 'Dest' }],
        moves: [{ identifier: { type: 'container_id', containerId: container.id }, targetPosition: '' }],
      })

      expect(result.success).toBe(true)
      const [moved] = await testDb.select().from(paper).all()
      expect(moved.sheetId).toBe(dest.id)
    })
  })

  describe('audit fields', () => {
    it('sets last_updated and updated_by on each moved Container and leaves skipped ones alone', async () => {
      const user = await createTestUser(testDb, { email: 'mover@test.com', name: 'Mover', password: 'password123' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'AuditPlate', locationId: location.id })
      const moved = await createTestStorageContainer(testDb)
      const blocked = await createTestStorageContainer(testDb, { specimenId: moved.specimenId, unitId: moved.unitId })
      await testDb.insert(micronixTube).values([
        { id: moved.id, collectionId: plate.id, barcode: 'MT-AUDIT-1', position: 'A01' },
        { id: blocked.id, collectionId: plate.id, barcode: 'MT-AUDIT-2', position: 'B01' },
      ])
      const old = '2020-01-01T00:00:00.000Z'
      await testDb.update(storageContainer).set({ lastUpdated: old })

      const result = await executeMoves(
        testDb,
        {
          atomicMode: 'best_effort',
          mappings: [{ fromCollectionName: 'AuditPlate', toCollectionName: 'AuditPlate' }],
          moves: [
            { identifier: { type: 'barcode', barcode: 'MT-AUDIT-1' }, targetPosition: 'C01' },
            { identifier: { type: 'barcode', barcode: 'MT-AUDIT-2' }, targetPosition: 'Z99' },
          ],
        },
        { userId: user.id },
      )

      expect(result.moved).toBe(1)
      const afterMoved = testDb.select().from(storageContainer).where(eq(storageContainer.id, moved.id)).get()
      const afterBlocked = testDb.select().from(storageContainer).where(eq(storageContainer.id, blocked.id)).get()
      expect(afterMoved?.updatedBy).toBe(user.id)
      expect(afterMoved?.lastUpdated).not.toBe(old)
      expect(afterBlocked?.updatedBy).toBeNull()
      expect(afterBlocked?.lastUpdated).toBe(old)
    })
  })
})
