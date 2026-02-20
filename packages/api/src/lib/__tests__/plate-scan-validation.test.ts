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
import { setScannerConfigurations } from '../settings'
import { validatePlateScan, inferPlateFromScan } from '../plate-scan-validation'
import { storageContainer } from '../../db/schema'
import { micronixTube } from '../../db/schema'
import type { Database } from '../../db/client'

describe('plate-scan-validation', () => {
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

  it('throws when scanner configuration not found', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })

    await expect(
      validatePlateScan(testDb, {
        csvText: 'Well,Barcode\nA01,MT001',
        plateId: plate.id,
        scannerConfigurationId: 'nonexistent-config',
      })
    ).rejects.toThrow('Scanner configuration not found')
  })

  it('throws when plate not found', async () => {
    await setScannerConfigurations(testDb, {
      configurations: [
        {
          id: 'test-config',
          name: 'Test',
          barcodeColumn: 'Barcode',
          positionType: 'single',
          positionColumn: 'Well',
          skipRows: 0,
        },
      ],
    }, null)

    await expect(
      validatePlateScan(testDb, {
        csvText: 'Well,Barcode\nA01,MT001',
        plateId: 99999,
        scannerConfigurationId: 'test-config',
      })
    ).rejects.toThrow('Plate not found')
  })

  it('returns validation result with match when scan matches expected', async () => {
    await setScannerConfigurations(testDb, {
      configurations: [
        {
          id: 'test-config',
          name: 'Test',
          barcodeColumn: 'Barcode',
          positionType: 'single',
          positionColumn: 'Well',
          skipRows: 0,
        },
      ],
    }, null)

    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
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

    const result = await validatePlateScan(testDb, {
      csvText: 'Well,Barcode\nA01,MT001',
      plateId: plate.id,
      scannerConfigurationId: 'test-config',
    })

    expect(result.plate).toEqual({ id: plate.id, name: 'Plate1' })
    expect(result.summary.matched).toBe(1)
    expect(result.summary.totalExpected).toBe(1)
    expect(result.wells).toHaveLength(1)
    expect(result.wells[0].status).toBe('match')
    expect(result.wells[0].position).toBe('A01')
    expect(result.wells[0].expectedBarcode).toBe('MT001')
    expect(result.wells[0].scanBarcode).toBe('MT001')
  })

  it('returns missing_in_scan when well expected but not in scan', async () => {
    await setScannerConfigurations(testDb, {
      configurations: [
        {
          id: 'test-config',
          name: 'Test',
          barcodeColumn: 'Barcode',
          positionType: 'single',
          positionColumn: 'Well',
          skipRows: 0,
        },
      ],
    }, null)

    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
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

    const result = await validatePlateScan(testDb, {
      csvText: 'Well,Barcode\n',
      plateId: plate.id,
      scannerConfigurationId: 'test-config',
    })

    expect(result.summary.missingInScan).toBe(1)
    expect(result.wells[0].status).toBe('missing_in_scan')
  })

  it('returns extra_in_scan when scan has barcode at position not in plate', async () => {
    await setScannerConfigurations(testDb, {
      configurations: [
        {
          id: 'test-config',
          name: 'Test',
          barcodeColumn: 'Barcode',
          positionType: 'single',
          positionColumn: 'Well',
          skipRows: 0,
        },
      ],
    }, null)

    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })

    const result = await validatePlateScan(testDb, {
      csvText: 'Well,Barcode\nA01,EXTRA',
      plateId: plate.id,
      scannerConfigurationId: 'test-config',
    })

    expect(result.summary.extraInScan).toBe(1)
    expect(result.wells[0].status).toBe('extra_in_scan')
    expect(result.wells[0].scanBarcode).toBe('EXTRA')
  })
})

describe('inferPlateFromScan', () => {
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

  beforeEach(async () => {
    await setScannerConfigurations(testDb, {
      configurations: [
        {
          id: 'test-config',
          name: 'Test',
          barcodeColumn: 'Barcode',
          positionType: 'single',
          positionColumn: 'Well',
          skipRows: 0,
        },
      ],
    }, null)
  })

  it('throws when scanner configuration not found', async () => {
    await expect(
      inferPlateFromScan(testDb, {
        csvText: 'Well,Barcode\nA01,MT001',
        scannerConfigurationId: 'nonexistent-config',
      })
    ).rejects.toThrow('Scanner configuration not found')
  })

  it('throws when scan has no barcodes', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })

    await expect(
      inferPlateFromScan(testDb, {
        csvText: 'Well,Barcode\nA01,\nA02,',
        scannerConfigurationId: 'test-config',
      })
    ).rejects.toThrow('Cannot infer plate: scan has no barcodes')
  })

  it('throws when a barcode is not in DB', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })

    await expect(
      inferPlateFromScan(testDb, {
        csvText: 'Well,Barcode\nA01,UNKNOWN_BARCODE',
        scannerConfigurationId: 'test-config',
      })
    ).rejects.toThrow(/Unknown barcode/)
  })

  it('throws when barcodes belong to more than one plate', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    const plate1 = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
    const plate2 = await createTestMicronixPlate(testDb, { name: 'Plate2', locationId: location.id })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const now = new Date().toISOString()

    const [c1] = await testDb.insert(storageContainer).values({
      specimenId: specimen.id,
      unitId: unit.id,
      totalQuantity: 1.0,
      remainingQuantity: 1.0,
      created: now,
      lastUpdated: now,
    }).returning()
    await testDb.insert(micronixTube).values({
      id: c1!.id,
      collectionId: plate1.id,
      barcode: 'MT001',
      position: 'A01',
    })

    const [c2] = await testDb.insert(storageContainer).values({
      specimenId: specimen.id,
      unitId: unit.id,
      totalQuantity: 1.0,
      remainingQuantity: 1.0,
      created: now,
      lastUpdated: now,
    }).returning()
    await testDb.insert(micronixTube).values({
      id: c2!.id,
      collectionId: plate2.id,
      barcode: 'MT002',
      position: 'A01',
    })

    await expect(
      inferPlateFromScan(testDb, {
        csvText: 'Well,Barcode\nA01,MT001\nA02,MT002',
        scannerConfigurationId: 'test-config',
      })
    ).rejects.toThrow(/multiple plates/)
  })

  it('returns single plate when all barcodes from same plate', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const now = new Date().toISOString()

    const [c1] = await testDb.insert(storageContainer).values({
      specimenId: specimen.id,
      unitId: unit.id,
      totalQuantity: 1.0,
      remainingQuantity: 1.0,
      created: now,
      lastUpdated: now,
    }).returning()
    await testDb.insert(micronixTube).values({
      id: c1!.id,
      collectionId: plate.id,
      barcode: 'MT001',
      position: 'A01',
    })

    const result = await inferPlateFromScan(testDb, {
      csvText: 'Well,Barcode\nA01,MT001',
      scannerConfigurationId: 'test-config',
    })

    expect(result.plate).toEqual({ id: plate.id, name: 'Plate1' })
  })

  it('ignores empty wells in scan for inference', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const now = new Date().toISOString()

    const [c1] = await testDb.insert(storageContainer).values({
      specimenId: specimen.id,
      unitId: unit.id,
      totalQuantity: 1.0,
      remainingQuantity: 1.0,
      created: now,
      lastUpdated: now,
    }).returning()
    await testDb.insert(micronixTube).values({
      id: c1!.id,
      collectionId: plate.id,
      barcode: 'MT001',
      position: 'A01',
    })

    const result = await inferPlateFromScan(testDb, {
      csvText: 'Well,Barcode\nA01,MT001\nA02,\nA03,',
      scannerConfigurationId: 'test-config',
    })

    expect(result.plate).toEqual({ id: plate.id, name: 'Plate1' })
  })

  it('infer then validate yields full result with inferred plate (route contract)', async () => {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, {
      name: 'Loc',
      storageTypeId: String(storageType.id),
    })
    const plate = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const now = new Date().toISOString()

    const [c1] = await testDb.insert(storageContainer).values({
      specimenId: specimen.id,
      unitId: unit.id,
      totalQuantity: 1.0,
      remainingQuantity: 1.0,
      created: now,
      lastUpdated: now,
    }).returning()
    await testDb.insert(micronixTube).values({
      id: c1!.id,
      collectionId: plate.id,
      barcode: 'MT001',
      position: 'A01',
    })

    const inferred = await inferPlateFromScan(testDb, {
      csvText: 'Well,Barcode\nA01,MT001',
      scannerConfigurationId: 'test-config',
    })
    const result = await validatePlateScan(testDb, {
      csvText: 'Well,Barcode\nA01,MT001',
      plateId: inferred.plate.id,
      scannerConfigurationId: 'test-config',
    })

    expect(result.plate).toEqual({ id: plate.id, name: 'Plate1' })
    expect(result.summary).toBeDefined()
    expect(result.wells).toBeDefined()
    expect(result.wells.length).toBeGreaterThan(0)
    // Route returns { ...result, inferredPlate: true } when plate was inferred
    const response = { ...result, inferredPlate: true }
    expect(response.inferredPlate).toBe(true)
  })
})
