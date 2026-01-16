import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, getResponseData, loginAndGetCookie, authenticatedRequest, createAuthenticatedClientWrapper } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestStrain } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { strain } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTestUser, setupPasswordRequirements, setupSessionSettings } from '../../__tests__/helpers/auth-helpers'

describe('Strains API', () => {
  let testDb: Database
  let sqlite: any
  let strainsRoutes: any
  let cookieHeader: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Setup required settings for auth to work
    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    // Create an admin user for authenticated requests
    await createTestUser(testDb, {
      email: 'admin@test.com',
      name: 'Admin User',
      password: 'password123',
      role: 'admin',
    })

    // Login to get session cookie
    const app = new Hono()
    const { createAuthRoutes } = await import('../../routes/auth')
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    cookieHeader = await loginAndGetCookie(app, 'admin@test.com', 'password123')

    // Create routes with test database
    const createSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
    })

    strainsRoutes = createCrudRoutes({
      table: strain,
      database: testDb,
      entityName: 'Strain',
      pluralName: 'strains',
      singularName: 'strain',
      createSchema,
      // Note: If we need to check if a strain is in use, we would check control definitions' properties JSON
      // For now, strains can be deleted without checking usage
    })
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /strains', () => {
    it('should return empty array when no strains exist', async () => {
      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, cookieHeader)

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as any
      expect(data).toEqual([])
    })

    it('should return all strains ordered by name', async () => {
      await createTestStrain(testDb, { name: 'Strain A', description: 'Description A' })
      await createTestStrain(testDb, { name: 'Strain B' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as any
      expect(data).toHaveLength(2)
      expect(data[0].name).toBe('Strain A')
    })
  })

  describe('POST /strains', () => {
    it('should create a new strain', async () => {
      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, cookieHeader)

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: 'New Strain',
          description: 'Test description',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res) as any
      expect(data.name).toBe('New Strain')
      expect(data.description).toBe('Test description')
    })

    it('should reject duplicate names', async () => {
      await createTestStrain(testDb, { name: 'Existing Strain' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, cookieHeader)

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: 'Existing Strain',
        },
      })

      expect(res.status).toBe(409)
      const data = await res.json() as any
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /strains/:id', () => {
    it('should return strain by ID', async () => {
      const testStrain = await createTestStrain(testDb, { name: 'Test Strain' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)

      const res = await authenticatedRequest(app, `/api/strains/${testStrain.id}`, {
        method: 'GET',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res) as any
      expect(data.id).toBe(testStrain.id)
      expect(data.name).toBe('Test Strain')
    })
  })

  describe('PUT /strains/:id', () => {
    it('should update strain', async () => {
      const testStrain = await createTestStrain(testDb, { name: 'Original' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, cookieHeader)

      const res = await authenticatedRequest(app, `/api/strains/${testStrain.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
        json: {
          name: 'Updated',
          description: 'New description',
        },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res) as any
      expect(data.name).toBe('Updated')
    })
  })

  describe('DELETE /strains/:id', () => {
    it('should delete strain when not in use', async () => {
      const testStrain = await createTestStrain(testDb, { name: 'Safe to Delete' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, cookieHeader)

      const res = await authenticatedRequest(app, `/api/strains/${testStrain.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(200)
    })

    // Note: Compositions are no longer used - strains are now embedded in control definitions via properties JSON
    // If we need to check for "in use" scenarios in the future, we would check control definitions' properties JSON
  })
})


