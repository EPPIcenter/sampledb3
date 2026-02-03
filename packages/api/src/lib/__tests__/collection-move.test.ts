import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestLocation, createTestStorageType } from '../../__tests__/helpers/factories'
import { resolveLocationByPath } from '../collection-move'
import type { Database } from '../../db/client'

describe('collection-move', () => {
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

  describe('resolveLocationByPath', () => {
    it('returns null for empty path', async () => {
      const id = await resolveLocationByPath(testDb, '')
      expect(id).toBe(null)
    })

    it('returns null when no location matches path', async () => {
      const id = await resolveLocationByPath(testDb, 'NonExistent/Path')
      expect(id).toBe(null)
    })

    it('returns location id when path matches', async () => {
      const st = await createTestStorageType(testDb, { name: 'Shelf', description: 'Test' })
      const loc = await createTestLocation(testDb, {
        name: 'Root',
        storageTypeId: String(st.id),
        path: 'Root',
      })
      const id = await resolveLocationByPath(testDb, 'Root')
      expect(id).toBe(loc.id)
    })
  })
})
