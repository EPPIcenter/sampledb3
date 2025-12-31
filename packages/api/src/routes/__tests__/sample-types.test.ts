import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestSampleType } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { sampleType } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

describe('Sample Types API', () => {
  let testDb: Database
  let sqlite: any
  let sampleTypesRoutes: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Create routes with test database
    const createSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
      parentId: z.number().int().optional(),
    })

    const updateSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
      parentId: z.number().int().optional().nullable(),
    })

    async function validateCreate(data: any, database: any): Promise<string | null> {
      if (data.parentId) {
        const parent = await database.select().from(sampleType).where(eq(sampleType.id, data.parentId)).get()
        if (!parent) {
          return 'Parent sample type not found'
        }
      }
      return null
    }

    async function validateUpdate(id: number, data: any, database: any): Promise<string | null> {
      if (data.parentId !== undefined && data.parentId !== null) {
        if (data.parentId === id) {
          return 'Sample type cannot be its own parent'
        }
        const parent = await database.select().from(sampleType).where(eq(sampleType.id, data.parentId)).get()
        if (!parent) {
          return 'Parent sample type not found'
        }
      }
      return null
    }

    async function checkSampleTypeInUse(id: number, database: any): Promise<string | null> {
      const children = await database
        .select()
        .from(sampleType)
        .where(eq(sampleType.parentId, id))
        .limit(1)
        .get()
      if (children) {
        return 'Cannot delete sample type: it has child sample types'
      }
      return null
    }

    sampleTypesRoutes = createCrudRoutes({
      table: sampleType,
      database: testDb,
      entityName: 'Sample type',
      pluralName: 'sampleTypes',
      singularName: 'sampleType',
      createSchema,
      updateSchema,
      validateCreate,
      validateUpdate,
      checkInUse: checkSampleTypeInUse,
    })
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /sample-types', () => {
    it('should return empty array when no sample types exist', async () => {
      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'].$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.sampleTypes).toEqual([])
    })

    it('should return all sample types', async () => {
      await createTestSampleType(testDb, { name: 'Type A' })
      await createTestSampleType(testDb, { name: 'Type B' })

      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'].$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.sampleTypes).toHaveLength(2)
    })
  })

  describe('POST /sample-types', () => {
    it('should create a new sample type', async () => {
      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'].$post({
        json: {
          name: 'New Sample Type',
          description: 'Test description',
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.sampleType.name).toBe('New Sample Type')
    })

    it('should create sample type with parentId', async () => {
      const parent = await createTestSampleType(testDb, { name: 'Parent Type' })

      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'].$post({
        json: {
          name: 'Child Type',
          parentId: parent.id,
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.sampleType.parentId).toBe(parent.id)
    })

    it('should reject invalid parentId', async () => {
      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'].$post({
        json: {
          name: 'Child Type',
          parentId: 99999, // Non-existent parent
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Parent sample type not found')
    })

    it('should reject duplicate names', async () => {
      await createTestSampleType(testDb, { name: 'Existing Type' })

      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'].$post({
        json: {
          name: 'Existing Type',
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('already exists')
    })
  })

  describe('PUT /sample-types/:id', () => {
    it('should update sample type', async () => {
      const testType = await createTestSampleType(testDb, { name: 'Original' })

      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'][':id'].$put({
        param: { id: String(testType.id) },
        json: {
          name: 'Updated',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.sampleType.name).toBe('Updated')
    })

    it('should reject setting parentId to self', async () => {
      const testType = await createTestSampleType(testDb, { name: 'Test Type' })

      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'][':id'].$put({
        param: { id: String(testType.id) },
        json: {
          name: 'Test Type',
          parentId: testType.id, // Cannot be its own parent
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('cannot be its own parent')
    })
  })

  describe('DELETE /sample-types/:id', () => {
    it('should delete sample type when not in use', async () => {
      const testType = await createTestSampleType(testDb, { name: 'Safe to Delete' })

      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'][':id'].$delete({
        param: { id: String(testType.id) },
      })

      expect(res.status).toBe(200)
    })

    it('should reject deletion when has children', async () => {
      const parent = await createTestSampleType(testDb, { name: 'Parent' })
      await createTestSampleType(testDb, { name: 'Child', parentId: parent.id })

      const app = new Hono()
      app.route('/api/sample-types', sampleTypesRoutes)
      const client = createTestClient(app) as any

      const res = await client.api['sample-types'][':id'].$delete({
        param: { id: String(parent.id) },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('has child sample types')
    })
  })
})


