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
import { validatePlateScan } from '../plate-scan-validation'
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
