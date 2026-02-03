import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient, getResponseData, loginAndGetCookie, authenticatedRequest, createAuthenticatedClientWrapper } from '../../__tests__/helpers/test-client'
import { Hono } from 'hono'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { specimenType, specimen, type SpecimenType } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTestUser, setupPasswordRequirements, setupSessionSettings } from '../../__tests__/helpers/auth-helpers'
import type { ErrorResponse } from '../../__tests__/helpers/test-types'
import { handleRouteError } from '../../lib/error-handler'

describe('Specimen Types API', () => {
  let app: Hono
  let testDb: Database
  let sqlite: unknown
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
    const authApp = new Hono()
    const { createAuthRoutes } = await import('../../routes/auth')
    authApp.route('/api/auth', createAuthRoutes(testDb, testDb))
    cookieHeader = await loginAndGetCookie(authApp, 'admin@test.com', 'password123')

    // Create routes with test database
    const createSchema = z.object({
      name: z.string().min(1, 'Name is required'),
    })

    function transformList(item: SpecimenType) {
      return {
        id: item.id,
        name: item.name,
        created: item.created,
        lastUpdated: item.lastUpdated,
      }
    }

    async function checkSpecimenTypeInUse(id: number, database: Database): Promise<string | null> {
      const inUse = await database
        .select()
        .from(specimen)
        .where(eq(specimen.specimenTypeId, id))
        .limit(1)
        .get()

      if (inUse) {
        return 'Cannot delete specimen type: it is in use by specimens'
      }
      return null
    }

    function onCreateDefaults() {
      const now = new Date().toISOString()
      return {
        created: now,
        lastUpdated: now,
      }
    }

    function onUpdateDefaults() {
      return {
        lastUpdated: new Date().toISOString(),
      }
    }

    const specimenTypesRoutes = createCrudRoutes({
      table: specimenType,
      database: testDb,
      entityName: 'Specimen type',
      pluralName: 'specimenTypes',
      singularName: 'specimenType',
      createSchema,
      transformList,
      checkInUse: checkSpecimenTypeInUse,
      onCreateDefaults,
      onUpdateDefaults,
    })

    app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.route('/api/specimen-types', specimenTypesRoutes)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite as Parameters<typeof cleanupTestDatabase>[0])
    }
  })

  describe('GET /specimen-types', () => {
    it('should return list of specimen types', async () => {
      const res = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'GET',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(200)
      const data = await getResponseData<SpecimenType[]>(res)
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('POST /specimen-types', () => {
    it('should create a new specimen type', async () => {
      const res = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: 'Test Type',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData<SpecimenType>(res)
      expect(data).toBeDefined()
      expect(data.name).toBe('Test Type')
      expect(data.id).toBeDefined()
    })

    it('should reject empty name', async () => {
      const res = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: '',
        },
      })

      expect(res.status).toBe(400)
    })

    it('should reject duplicate names', async () => {
      // Create first type
      await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Duplicate Test' },
      })

      // Try to create duplicate
      const res = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: 'Duplicate Test',
        },
      })

      expect(res.status).toBe(409)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /specimen-types/:id', () => {
    it('should return specimen type by ID', async () => {
      // Create a type first
      const createRes = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Get Test Type' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const id = created.id

      const res = await authenticatedRequest(app, `/api/specimen-types/${id}`, {
        method: 'GET',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(200)
      const data = await getResponseData<SpecimenType>(res)
      expect(data.id).toBe(id)
      expect(data.name).toBe('Get Test Type')
    })

    it('should return 404 for non-existent ID', async () => {
      const res = await authenticatedRequest(app, '/api/specimen-types/99999', {
        method: 'GET',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(404)
    })

    it('should return 400 for invalid ID', async () => {
      const res = await authenticatedRequest(app, '/api/specimen-types/invalid', {
        method: 'GET',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /specimen-types/:id', () => {
    it('should update specimen type', async () => {
      // Create a type first
      const createRes = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Original Name' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const id = created.id

      const res = await authenticatedRequest(app, `/api/specimen-types/${id}`, {
        method: 'PUT',
        cookie: cookieHeader,
        json: {
          name: 'Updated Name',
        },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData<SpecimenType>(res)
      expect(data.name).toBe('Updated Name')
    })

    it('should reject duplicate names on update', async () => {
      // Create two types
      const create1 = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Type A' },
      })
      const type1 = await getResponseData<SpecimenType>(create1)

      await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Type B' },
      })

      // Try to update type1 to have the same name as type2
      const res = await authenticatedRequest(app, `/api/specimen-types/${type1.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
        json: {
          name: 'Type B', // Duplicate
        },
      })

      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /specimen-types/:id', () => {
    it('should delete specimen type when not in use', async () => {
      // Create a type
      const createRes = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Delete Test Type' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const id = created.id

      const res = await authenticatedRequest(app, `/api/specimen-types/${id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(200)

      // Verify it's deleted
      const getRes = await authenticatedRequest(app, `/api/specimen-types/${id}`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(getRes.status).toBe(404)
    })

    it('should return 400 for invalid ID', async () => {
      const res = await authenticatedRequest(app, '/api/specimen-types/invalid', {
        method: 'DELETE',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(400)
    })
  })

  describe('List transformation', () => {
    it('should transform list response to include only specific fields', async () => {
      await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Type 1' },
      })
      await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Type 2' },
      })

      const res = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      // Check that list items have the transformed structure
      const data = await getResponseData<SpecimenType[]>(res)
      if (data.length > 0) {
        const item = data[0]
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('name')
        expect(item).toHaveProperty('created')
        expect(item).toHaveProperty('lastUpdated')
      }
    })
  })

  describe('Timestamp handling', () => {
    it('should set created and lastUpdated on create', async () => {
      const res = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Timestamp Test' },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData<SpecimenType>(res)
      expect(data.created).toBeDefined()
      expect(data.lastUpdated).toBeDefined()
      expect(new Date(data.created).getTime()).toBeGreaterThan(0)
    })

    it('should update lastUpdated on update', async () => {
      const createRes = await authenticatedRequest(app, '/api/specimen-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Update Timestamp Test' },
      })
      const created = await getResponseData<SpecimenType>(createRes)
      const originalUpdated = created.lastUpdated

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const updateRes = await authenticatedRequest(app, `/api/specimen-types/${created.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
        json: { name: 'Updated Name' },
      })

      expect(updateRes.status).toBe(200)
      const updated = await getResponseData<SpecimenType>(updateRes)
      expect(updated.lastUpdated).not.toBe(originalUpdated)
    })
  })
})
