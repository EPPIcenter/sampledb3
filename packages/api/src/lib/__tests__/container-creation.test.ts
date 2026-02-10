import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import { validateContainerData } from '../container-creation'

describe('container-creation', () => {
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

  describe('validateContainerData', () => {
    describe('micronix_tube', () => {
      it('returns error when barcode is missing', async () => {
        const result = await validateContainerData(testDb, 'micronix_tube', {
          containerType: 'micronix_tube',
          collectionName: 'Plate1',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Barcode is required for micronix tubes')
      })

      it('returns error when collection name and barcode are missing', async () => {
        const result = await validateContainerData(testDb, 'micronix_tube', {
          containerType: 'micronix_tube',
          barcode: 'MT001',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name or barcode is required')
      })

      it('returns error when position is missing', async () => {
        const result = await validateContainerData(testDb, 'micronix_tube', {
          containerType: 'micronix_tube',
          barcode: 'MT001',
          collectionName: 'Plate1',
          position: '',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Position')
      })
    })

    describe('cryovial_tube', () => {
      it('returns error when collection name and barcode are missing', async () => {
        const result = await validateContainerData(testDb, 'cryovial_tube', {
          containerType: 'cryovial_tube',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name or barcode is required')
      })

      it('returns error when position is empty', async () => {
        const result = await validateContainerData(testDb, 'cryovial_tube', {
          containerType: 'cryovial_tube',
          collectionName: 'Box1',
          position: '   ',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Position')
      })
    })

    describe('paper', () => {
      it('returns error when collection name is missing', async () => {
        const result = await validateContainerData(testDb, 'paper', {
          containerType: 'paper',
          label: 'L1',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name is required for papers')
      })

      it('returns error when label is missing', async () => {
        const result = await validateContainerData(testDb, 'paper', {
          containerType: 'paper',
          collectionName: 'Sheet1',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Label is required for papers')
      })
    })

    describe('static_well', () => {
      it('returns error when collection name and barcode are missing', async () => {
        const result = await validateContainerData(testDb, 'static_well', {
          containerType: 'static_well',
          position: 'A01',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Collection name or barcode is required')
      })

      it('returns error when position is missing', async () => {
        const result = await validateContainerData(testDb, 'static_well', {
          containerType: 'static_well',
          collectionName: 'Plate1',
        })
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Position')
      })
    })
  })
})
