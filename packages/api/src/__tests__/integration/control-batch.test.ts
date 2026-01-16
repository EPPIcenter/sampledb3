import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient, loginAndGetCookie, createAuthenticatedClientWrapper, authenticatedRequest } from '../helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/db-setup'
import { 
  createTestControlDefinition, 
  createTestControlBatch,
  createTestSpecimenType,
  createTestSpecimen,
} from '../helpers/factories'
import type { Database } from '../../db/client'
import { createControlsRoutes } from '../../routes/controls'
import { createAuthRoutes } from '../../routes/auth'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../helpers/auth-helpers'
import { Hono } from 'hono'

describe('Control Batch Creation Integration Tests', () => {
  let testDb: Database
  let sqlite: any
  let client: ReturnType<typeof createTestClient>
  let cookieHeader: string
  let app: Hono

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Setup required settings for auth to work
    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    // Create a test user for authentication
    await createTestUser(testDb, {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      role: 'member',
    })

    app = new Hono()
    // Use factory pattern with test database
    const controlsRoutes = createControlsRoutes(testDb)
    const authRoutes = createAuthRoutes(testDb, testDb)
    app.route('/api/blood-controls', controlsRoutes)
    app.route('/api/auth', authRoutes)
    
    // Login to get session cookie
    cookieHeader = await loginAndGetCookie(app, 'test@example.com', 'password123')
    
    // Create authenticated client
    const baseClient = createTestClient(app)
    client = createAuthenticatedClientWrapper(baseClient, cookieHeader)
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

    // Create batch using authenticated request
    const response = await authenticatedRequest(app, `/api/blood-controls/${definition.id}/batches`, {
      method: 'POST',
      cookie: cookieHeader,
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
    const response = await authenticatedRequest(app, '/api/blood-controls/99999/batches', {
      method: 'POST',
      cookie: cookieHeader,
      json: {
        productionDate: '2024-01-01',
      },
    })

    expect(response.status).toBe(404)
    const data = await response.json() as any
    expect(data).toHaveProperty('error')
  })
})
