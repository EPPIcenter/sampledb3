import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestSpecimen,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import {
  resolveContainerByPosition,
  resolveContainerByBarcode,
  resolveContainerByIdentifier,
  inferCollectionTypeFromContainers,
  executeMoves,
  type ContainerInfo,
} from '../container-move'
import { storageContainer } from '../../db/schema'
import { micronixTube } from '../../db/schema'
import type { Database } from '../../db/client'

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
      const now = new Date().toISOString()
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
      const now = new Date().toISOString()
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
      const now = new Date().toISOString()
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

    it('moves micronix tube to new position within same plate', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(testDb, { name: 'MovePlate', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = new Date().toISOString()
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
      const now = new Date().toISOString()

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
      const now = new Date().toISOString()

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
      const now = new Date().toISOString()

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
})
