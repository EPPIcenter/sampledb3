import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient, getResponseData } from '../../__tests__/helpers/test-client'
import { Hono } from 'hono'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { specimenType, specimen } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

describe('Specimen Types API', () => {
  let app: Hono
  let testDb: Database
  let sqlite: any
  let specimenTypesRoutes: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Create routes with test database
    const createSchema = z.object({
      name: z.string().min(1, 'Name is required'),
    })

    function transformList(item: any) {
      return {
        id: item.id,
        name: item.name,
        created: item.created,
        lastUpdated: item.lastUpdated,
      }
    }

    async function checkSpecimenTypeInUse(id: number, database: any): Promise<string | null> {
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

    specimenTypesRoutes = createCrudRoutes({
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
    app.route('/api/specimen-types', specimenTypesRoutes)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /specimen-types', () => {
    it('should return list of specimen types', async () => {
      const client = createTestClient(app) as any
      const res = await client.api['specimen-types'].$get()

      expect(res.status).toBe(200)
      const data = await getResponseData(res)
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('POST /specimen-types', () => {
    it('should create a new specimen type', async () => {
      const client = createTestClient(app) as any
      const res = await client.api['specimen-types'].$post({
        json: {
          name: 'Test Type',
        },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res)
      expect(data).toBeDefined()
      expect(data.name).toBe('Test Type')
      expect(data.id).toBeDefined()
    })

    it('should reject empty name', async () => {
      const client = createTestClient(app) as any
      const res = await client.api['specimen-types'].$post({
        json: {
          name: '',
        },
      })

      expect(res.status).toBe(400)
    })

    it('should reject duplicate names', async () => {
      const client = createTestClient(app) as any

      // Create first type
      await client.api['specimen-types'].$post({
        json: { name: 'Duplicate Test' },
      })

      // Try to create duplicate
      const res = await client.api['specimen-types'].$post({
        json: {
          name: 'Duplicate Test',
        },
      })

      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /specimen-types/:id', () => {
    it('should return specimen type by ID', async () => {
      const client = createTestClient(app) as any

      // Create a type first
      const createRes = await client.api['specimen-types'].$post({
        json: { name: 'Get Test Type' },
      })
      const created = await getResponseData(createRes)
      const id = created.id

      const res = await client.api['specimen-types'][':id'].$get({
        param: { id: String(id) },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res)
      expect(data.id).toBe(id)
      expect(data.name).toBe('Get Test Type')
    })

    it('should return 404 for non-existent ID', async () => {
      const client = createTestClient(app) as any
      const res = await client.api['specimen-types'][':id'].$get({
        param: { id: '99999' },
      })

      expect(res.status).toBe(404)
    })

    it('should return 400 for invalid ID', async () => {
      const client = createTestClient(app) as any
      const res = await client.api['specimen-types'][':id'].$get({
        param: { id: 'invalid' },
      })

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /specimen-types/:id', () => {
    it('should update specimen type', async () => {
      const client = createTestClient(app) as any

      // Create a type first
      const createRes = await client.api['specimen-types'].$post({
        json: { name: 'Original Name' },
      })
      const created = await getResponseData(createRes)
      const id = created.id

      const res = await client.api['specimen-types'][':id'].$put({
        param: { id: String(id) },
        json: {
          name: 'Updated Name',
        },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res)
      expect(data.name).toBe('Updated Name')
    })

    it('should reject duplicate names on update', async () => {
      const client = createTestClient(app) as any

      // Create two types
      const create1 = await client.api['specimen-types'].$post({
        json: { name: 'Type A' },
      })
      const type1 = await getResponseData(create1)

      await client.api['specimen-types'].$post({
        json: { name: 'Type B' },
      })

      // Try to update type1 to have the same name as type2
      const res = await client.api['specimen-types'][':id'].$put({
        param: { id: String(type1.id) },
        json: {
          name: 'Type B', // Duplicate
        },
      })

      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /specimen-types/:id', () => {
    it('should delete specimen type when not in use', async () => {
      const client = createTestClient(app) as any

      // Create a type
      const createRes = await client.api['specimen-types'].$post({
        json: { name: 'Delete Test Type' },
      })
      const created = await getResponseData(createRes)
      const id = created.id

      const res = await client.api['specimen-types'][':id'].$delete({
        param: { id: String(id) },
      })

      expect(res.status).toBe(200)

      // Verify it's deleted
      const getRes = await client.api['specimen-types'][':id'].$get({
        param: { id: String(id) },
      })
      expect(getRes.status).toBe(404)
    })

    it('should return 400 for invalid ID', async () => {
      const client = createTestClient(app) as any
      const res = await client.api['specimen-types'][':id'].$delete({
        param: { id: 'invalid' },
      })

      expect(res.status).toBe(400)
    })
  })

  describe('List transformation', () => {
    it('should transform list response to include only specific fields', async () => {
      const client = createTestClient(app) as any

      await client.api['specimen-types'].$post({
        json: { name: 'Type 1' },
      })
      await client.api['specimen-types'].$post({
        json: { name: 'Type 2' },
      })

      const res = await client.api['specimen-types'].$get()
      expect(res.status).toBe(200)
      // Check that list items have the transformed structure
      const data = await getResponseData(res)
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
      const client = createTestClient(app) as any

      const res = await client.api['specimen-types'].$post({
        json: { name: 'Timestamp Test' },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res)
      expect(data.created).toBeDefined()
      expect(data.lastUpdated).toBeDefined()
      expect(new Date(data.created).getTime()).toBeGreaterThan(0)
    })

    it('should update lastUpdated on update', async () => {
      const client = createTestClient(app) as any

      const createRes = await client.api['specimen-types'].$post({
        json: { name: 'Update Timestamp Test' },
      })
      const created = await getResponseData(createRes)
      const originalUpdated = created.lastUpdated

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const updateRes = await client.api['specimen-types'][':id'].$put({
        param: { id: String(created.id) },
        json: { name: 'Updated Name' },
      })

      expect(updateRes.status).toBe(200)
      const updated = await getResponseData(updateRes)
      expect(updated.lastUpdated).not.toBe(originalUpdated)
    })
  })
})
