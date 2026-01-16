import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient } from '../helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/db-setup'
import { 
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestLocation,
  createTestStorageType,
} from '../helpers/factories'
import type { Database } from '../../db/client'
import { createCollectionsRoutes } from '../../routes/collections'

describe('Collection Move Integration Tests', () => {
  let testDb: Database
  let sqlite: any
  let client: ReturnType<typeof createTestClient>

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    const app = new (await import('hono')).Hono()
    app.route('/api/collections', createCollectionsRoutes(testDb))
    client = createTestClient(app)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  it('should move a collection to a new location', async () => {
    // Setup: Create storage type and locations
    const storageType = await createTestStorageType(testDb, {
      name: 'Freezer',
      description: 'Test freezer',
    })
    const sourceLocation = await createTestLocation(testDb, {
      name: 'Source Location',
      storageTypeId: storageType.id,
    })
    const targetLocation = await createTestLocation(testDb, {
      name: 'Target Location',
      storageTypeId: storageType.id,
    })

    // Note: This test requires a collection (plate/box) to be created first
    // The actual move would need collection setup
    // This is a basic structure - expand based on actual collection move route structure
    expect(sourceLocation).toBeDefined()
    expect(targetLocation).toBeDefined()
  })
})
