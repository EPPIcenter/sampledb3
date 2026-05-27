import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import {
  createTestClient,
  getResponseData,
  authenticatedRequest,
  createAuthenticatedClientWrapper,
} from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createTestStorageType, createTestLocation } from '../../__tests__/helpers/factories'
import { createCrudRoutes } from '../../lib/crud-routes'
import { storageType, location } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

describe('Storage Types API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    const createSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
    })

    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin User',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        async function checkStorageTypeInUse(id: number, database: typeof db): Promise<string | null> {
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

        const storageTypesRoutes = createCrudRoutes({
          table: storageType,
          database: db,
          entityName: 'Storage type',
          pluralName: 'storageTypes',
          singularName: 'storageType',
          createSchema,
          checkInUse: checkStorageTypeInUse,
        })
        app.route('/api/storage-types', storageTypesRoutes)
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  function createApp(): Hono {
    return ctx.createRequestApp()
  }

  describe('GET /storage-types', () => {
    it('should return empty array when no storage types exist', async () => {
      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'GET',
        cookie: ctx.cookie,
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as any
      expect(data).toEqual([])
    })

    it('should return all storage types', async () => {
      await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Cold storage' })
      await createTestStorageType(ctx.db, { name: 'Refrigerator', description: 'Cool storage' })

      const app = createApp()

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'GET',
        cookie: ctx.cookie,
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as any
      expect(data).toHaveLength(2)
    })
  })

  describe('POST /storage-types', () => {
    it('should create a new storage type', async () => {
      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          name: 'New Storage Type',
          description: 'Test description',
        },
      })

      expect(res.status).toBe(201)
      const data = (await getResponseData(res)) as any
      expect(data.name).toBe('New Storage Type')
      expect(data.description).toBe('Test description')
    })

    it('should create storage type without description', async () => {
      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          name: 'Simple Type',
        },
      })

      expect(res.status).toBe(201)
      const data = (await getResponseData(res)) as any
      expect(data.name).toBe('Simple Type')
    })

    it('should reject duplicate names', async () => {
      await createTestStorageType(ctx.db, { name: 'Existing Type' })

      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, '/api/storage-types', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          name: 'Existing Type',
        },
      })

      expect(res.status).toBe(409)
      const data = (await res.json()) as any
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /storage-types/:id', () => {
    it('should return storage type by ID', async () => {
      const testType = await createTestStorageType(ctx.db, { name: 'Test Type' })

      const app = createApp()

      const res = await authenticatedRequest(app, `/api/storage-types/${testType.id}`, {
        method: 'GET',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as any
      expect(data.id).toBe(testType.id)
      expect(data.name).toBe('Test Type')
    })

    it('should return 404 for non-existent ID', async () => {
      const app = createApp()

      const res = await authenticatedRequest(app, '/api/storage-types/99999', {
        method: 'GET',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(404)
    })
  })

  describe('PUT /storage-types/:id', () => {
    it('should update storage type', async () => {
      const testType = await createTestStorageType(ctx.db, { name: 'Original' })

      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, `/api/storage-types/${testType.id}`, {
        method: 'PUT',
        cookie: ctx.cookie,
        json: {
          name: 'Updated',
          description: 'New description',
        },
      })

      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as any
      expect(data.name).toBe('Updated')
      expect(data.description).toBe('New description')
    })
  })

  describe('DELETE /storage-types/:id', () => {
    it('should delete storage type when not in use', async () => {
      const testType = await createTestStorageType(ctx.db, { name: 'Safe to Delete' })

      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, `/api/storage-types/${testType.id}`, {
        method: 'DELETE',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
    })

    it('should reject deletion when in use by locations (by ID)', async () => {
      const testType = await createTestStorageType(ctx.db, { name: 'In Use Type' })
      await createTestLocation(ctx.db, {
        name: 'Root',
        parentId: null,
        storageTypeId: String(testType.id),
        canContainCollections: false,
        path: 'Root',
      })

      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, `/api/storage-types/${testType.id}`, {
        method: 'DELETE',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toContain('in use')
    })
  })
})
