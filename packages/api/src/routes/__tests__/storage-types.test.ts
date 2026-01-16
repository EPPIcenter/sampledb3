import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, getResponseData, loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestStorageType, createTestLocation } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { storageType, location } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTestUser, setupPasswordRequirements, setupSessionSettings } from '../../__tests__/helpers/auth-helpers'

describe('Storage Types API', () => {
  let testDb: Database
  let sqlite: any
  let storageTypesRoutes: any
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

    async function checkStorageTypeInUse(id: number, database: any): Promise<string | null> {
      const typeRecord = await database
        .select()
        .from(storageType)
        .where(eq(storageType.id, id))
        .get()

      if (!typeRecord) {
        return 'Storage type not found'
      }

      const inUse = await database
        .select()
        .from(location)
        .where(eq(location.storageTypeId, String(typeRecord.id)))
        .limit(1)
        .get()

      if (inUse) {
        return 'Cannot delete storage type: it is in use by locations'
      }
      return null
    }

    storageTypesRoutes = createCrudRoutes({
      table: storageType,
      database: testDb,
      entityName: 'Storage type',
      pluralName: 'storageTypes',
      singularName: 'storageType',
      createSchema,
      checkInUse: checkStorageTypeInUse,
    })
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /storage-types', () => {
    it('should return empty array when no storage types exist', async () => {
      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['storage-types'].$get()
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as any
      expect(data).toEqual([])
    })

    it('should return all storage types', async () => {
      await createTestStorageType(testDb, { name: 'Freezer', description: 'Cold storage' })
      await createTestStorageType(testDb, { name: 'Refrigerator', description: 'Cool storage' })

      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['storage-types'].$get()
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as any
      expect(data).toHaveLength(2)
    })
  })

  describe('POST /storage-types', () => {
    it('should create a new storage type', async () => {
      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: 'New Storage Type',
          description: 'Test description',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res) as any
      expect(data.name).toBe('New Storage Type')
      expect(data.description).toBe('Test description')
    })

    it('should create storage type without description', async () => {
      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: 'Simple Type',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res) as any
      expect(data.name).toBe('Simple Type')
    })

    it('should reject duplicate names', async () => {
      await createTestStorageType(testDb, { name: 'Existing Type' })

      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          name: 'Existing Type',
        },
      })

      expect(res.status).toBe(409)
      const data = await res.json() as any
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /storage-types/:id', () => {
    it('should return storage type by ID', async () => {
      const testType = await createTestStorageType(testDb, { name: 'Test Type' })

      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['storage-types'][':id'].$get({
        param: { id: String(testType.id) },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res) as any
      expect(data.id).toBe(testType.id)
      expect(data.name).toBe('Test Type')
    })

    it('should return 404 for non-existent ID', async () => {
      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['storage-types'][':id'].$get({
        param: { id: '99999' },
      })

      expect(res.status).toBe(404)
    })
  })

  describe('PUT /storage-types/:id', () => {
    it('should update storage type', async () => {
      const testType = await createTestStorageType(testDb, { name: 'Original' })

      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await authenticatedRequest(app, `/api/storage-types/${testType.id}`, {
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
      expect(data.description).toBe('New description')
    })
  })

  describe('DELETE /storage-types/:id', () => {
    it('should delete storage type when not in use', async () => {
      const testType = await createTestStorageType(testDb, { name: 'Safe to Delete' })

      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await authenticatedRequest(app, `/api/storage-types/${testType.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(200)
    })

    it('should reject deletion when in use by locations (by ID)', async () => {
      const testType = await createTestStorageType(testDb, { name: 'In Use Type' })
      await createTestLocation(testDb, {
        name: 'Root',
        parentId: null,
        storageTypeId: String(testType.id),
        canContainCollections: false,
        path: 'Root',
      })

      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await authenticatedRequest(app, `/api/storage-types/${testType.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toContain('in use')
    })

  })
})


