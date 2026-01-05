import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestStrain } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { strain } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

describe('Strains API', () => {
  let testDb: Database
  let sqlite: any
  let strainsRoutes: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Create routes with test database
    const createSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
    })

    async function checkStrainInUse(id: number, database: any): Promise<string | null> {
      // Note: Compositions are no longer used - strains are now embedded in control definitions via properties JSON
      // This check is kept for backward compatibility but always returns null since compositions don't exist
      // In the future, if we need to check for "in use" scenarios, we would check control definitions' properties JSON
      return null
    }

    strainsRoutes = createCrudRoutes({
      table: strain,
      database: testDb,
      entityName: 'Strain',
      pluralName: 'strains',
      singularName: 'strain',
      createSchema,
      checkInUse: checkStrainInUse,
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
      const client = createTestClient(app) as any

      const res = await client.api.strains.$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.strains).toEqual([])
    })

    it('should return all strains ordered by name', async () => {
      await createTestStrain(testDb, { name: 'Strain A', description: 'Description A' })
      await createTestStrain(testDb, { name: 'Strain B' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.strains.$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.strains).toHaveLength(2)
      expect(data.strains[0].name).toBe('Strain A')
    })
  })

  describe('POST /strains', () => {
    it('should create a new strain', async () => {
      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.strains.$post({
        json: {
          name: 'New Strain',
          description: 'Test description',
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.strain.name).toBe('New Strain')
      expect(data.strain.description).toBe('Test description')
    })

    it('should reject duplicate names', async () => {
      await createTestStrain(testDb, { name: 'Existing Strain' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.strains.$post({
        json: {
          name: 'Existing Strain',
        },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /strains/:id', () => {
    it('should return strain by ID', async () => {
      const testStrain = await createTestStrain(testDb, { name: 'Test Strain' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.strains[':id'].$get({
        param: { id: String(testStrain.id) },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.strain.id).toBe(testStrain.id)
      expect(data.strain.name).toBe('Test Strain')
    })
  })

  describe('PUT /strains/:id', () => {
    it('should update strain', async () => {
      const testStrain = await createTestStrain(testDb, { name: 'Original' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.strains[':id'].$put({
        param: { id: String(testStrain.id) },
        json: {
          name: 'Updated',
          description: 'New description',
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.strain.name).toBe('Updated')
    })
  })

  describe('DELETE /strains/:id', () => {
    it('should delete strain when not in use', async () => {
      const testStrain = await createTestStrain(testDb, { name: 'Safe to Delete' })

      const app = new Hono()
      app.route('/api/strains', strainsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.strains[':id'].$delete({
        param: { id: String(testStrain.id) },
      })

      expect(res.status).toBe(200)
    })

    // Note: Compositions are no longer used - strains are now embedded in control definitions via properties JSON
    // If we need to check for "in use" scenarios in the future, we would check control definitions' properties JSON
  })
})


