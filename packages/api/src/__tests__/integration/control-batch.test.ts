import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient } from '../helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/db-setup'
import { 
  createTestControlDefinition, 
  createTestControlBatch,
  createTestSpecimenType,
  createTestSpecimen,
} from '../helpers/factories'
import type { Database } from '../../db/client'
import { createControlsRoutes } from '../../routes/controls'

describe('Control Batch Creation Integration Tests', () => {
  let testDb: Database
  let sqlite: any
  let client: ReturnType<typeof createTestClient>

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    const app = new (await import('hono')).Hono()
    // Use factory pattern with test database
    const controlsRoutes = createControlsRoutes(testDb)
    app.route('/api/blood-controls', controlsRoutes)
    client = createTestClient(app)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  it('should create a control batch successfully', async () => {
    // Create a control definition first
    const definition = await createTestControlDefinition(testDb, {
      name: 'Test Control',
      controlType: 'blood',
    })

    // Create batch using RPC client with correct nested path
    const response = await (client as any).api['blood-controls'][':id']['batches'].$post({
      param: { id: definition.id.toString() },
      json: {
        productionDate: '2024-01-01',
      },
    })

    if (response.status !== 201) {
      const errorData = await response.json() as any
      console.error('Control batch creation failed:', errorData)
    }
    expect(response.status).toBe(201)
    const data = await response.json() as any
    expect(data).toHaveProperty('batch')
    expect(data.batch).toHaveProperty('id')
    expect(data.batch.controlDefinitionId).toBe(definition.id)
  })

  it('should return 404 when control definition does not exist', async () => {
    const response = await (client as any).api['blood-controls'][':id']['batches'].$post({
      param: { id: '99999' },
      json: {
        productionDate: '2024-01-01',
      },
    })

    expect(response.status).toBe(404)
    const data = await response.json() as any
    expect(data).toHaveProperty('error')
  })
})
