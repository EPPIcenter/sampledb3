import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, getResponseData } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestStorageType, createTestLocation } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { storageType, location } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

describe('Storage Types API', () => {
  let testDb: Database
  let sqlite: any
  let storageTypesRoutes: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

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
      const data = await getResponseData(res)
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
      const data = await getResponseData(res)
      expect(data).toHaveLength(2)
    })
  })

  describe('POST /storage-types', () => {
    it('should create a new storage type', async () => {
      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['storage-types'].$post({
        json: {
          name: 'New Storage Type',
          description: 'Test description',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res)
      expect(data.name).toBe('New Storage Type')
      expect(data.description).toBe('Test description')
    })

    it('should create storage type without description', async () => {
      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['storage-types'].$post({
        json: {
          name: 'Simple Type',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res)
      expect(data.name).toBe('Simple Type')
    })

    it('should reject duplicate names', async () => {
      await createTestStorageType(testDb, { name: 'Existing Type' })

      const app = new Hono()
      app.route('/api/storage-types', storageTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['storage-types'].$post({
        json: {
          name: 'Existing Type',
        },
      })

      expect(res.status).toBe(409)
      const data = await res.json()
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
      const data = await getResponseData(res)
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

      const res = await client.api['storage-types'][':id'].$put({
        param: { id: String(testType.id) },
        json: {
          name: 'Updated',
          description: 'New description',
        },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res)
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

      const res = await client.api['storage-types'][':id'].$delete({
        param: { id: String(testType.id) },
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

      const res = await client.api['storage-types'][':id'].$delete({
        param: { id: String(testType.id) },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('in use')
    })

  })
})


