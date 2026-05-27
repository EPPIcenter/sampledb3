import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  resolveCollection,
  resolveCollectionByName,
  resolveCollectionByBarcode,
} from '../collection-resolve'
import type { Database } from '../../../db/client'

describe('collection-resolve lib', () => {
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

  describe('resolveCollectionByName', () => {
    it('returns null for non-existent name', async () => {
      const id = await resolveCollectionByName('nonexistent', 'micronix_plate', testDb)
      expect(id).toBeNull()
    })

    it('returns null for unknown collection type', async () => {
      const id = await resolveCollectionByName('x', 'micronix_plate' as any, testDb)
      expect(id).toBeNull()
    })
  })

  describe('resolveCollectionByBarcode', () => {
    it('returns null for non-existent barcode', async () => {
      const id = await resolveCollectionByBarcode('NOBARCODE', 'micronix_plate', testDb)
      expect(id).toBeNull()
    })

    it('returns null for box type (no barcode resolution)', async () => {
      const id = await resolveCollectionByBarcode('x', 'box', testDb)
      expect(id).toBeNull()
    })
  })

  describe('resolveCollection', () => {
    it('returns null when name and barcode do not match', async () => {
      const id = await resolveCollection('unknown', 'micronix_plate', testDb)
      expect(id).toBeNull()
    })
  })
})
