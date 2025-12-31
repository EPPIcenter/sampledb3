import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestComposition, createTestControlDefinition } from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { createCrudRoutes } from '../../lib/crud-routes'
import { composition, controlDefinition } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

describe('Compositions API', () => {
  let testDb: Database
  let sqlite: any
  let compositionsRoutes: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    // Create routes with test database
    const createSchema = z.object({
      index: z.number().int().optional(),
      label: z.string().min(1, 'Label is required'),
      legacy: z.number().int().default(0),
    })

    const updateSchema = z.object({
      index: z.number().int().optional(),
      label: z.string().min(1, 'Label is required'),
      legacy: z.number().int().optional(),
    })

    async function checkCompositionInUse(id: number, database: any): Promise<string | null> {
      const inUse = await database
        .select()
        .from(controlDefinition)
        .where(eq(controlDefinition.compositionId, id))
        .limit(1)
        .get()

      if (inUse) {
        return 'Cannot delete composition: it is in use by control definitions'
      }
      return null
    }

    compositionsRoutes = createCrudRoutes({
      table: composition,
      database: testDb,
      entityName: 'Composition',
      pluralName: 'compositions',
      singularName: 'composition',
      createSchema,
      updateSchema,
      orderBy: composition.label,
      checkInUse: checkCompositionInUse,
    })
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /compositions', () => {
    it('should return empty array when no compositions exist', async () => {
      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions.$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.compositions).toEqual([])
    })

    it('should return all compositions ordered by label', async () => {
      await createTestComposition(testDb, { label: 'Zebra', index: 3 })
      await createTestComposition(testDb, { label: 'Alpha', index: 1 })
      await createTestComposition(testDb, { label: 'Beta', index: 2 })

      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions.$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.compositions).toHaveLength(3)
      // Should be ordered by label, not index
      expect(data.compositions[0].label).toBe('Alpha')
      expect(data.compositions[1].label).toBe('Beta')
      expect(data.compositions[2].label).toBe('Zebra')
    })
  })

  describe('POST /compositions', () => {
    it('should create a new composition', async () => {
      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions.$post({
        json: {
          label: 'New Composition',
          index: 1,
          legacy: 0,
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.composition.label).toBe('New Composition')
      expect(data.composition.index).toBe(1)
      expect(data.composition.legacy).toBe(0)
    })

    it('should create composition with default legacy value', async () => {
      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions.$post({
        json: {
          label: 'Test Composition',
        },
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.composition.legacy).toBe(0) // Default value
    })
  })

  describe('GET /compositions/:id', () => {
    it('should return composition by ID', async () => {
      const testComp = await createTestComposition(testDb, { label: 'Test Composition', index: 5 })

      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions[':id'].$get({
        param: { id: String(testComp.id) },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.composition.id).toBe(testComp.id)
      expect(data.composition.label).toBe('Test Composition')
      expect(data.composition.index).toBe(5)
    })
  })

  describe('PUT /compositions/:id', () => {
    it('should update composition', async () => {
      const testComp = await createTestComposition(testDb, { label: 'Original', index: 1 })

      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions[':id'].$put({
        param: { id: String(testComp.id) },
        json: {
          label: 'Updated',
          index: 2,
        },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.composition.label).toBe('Updated')
      expect(data.composition.index).toBe(2)
    })
  })

  describe('DELETE /compositions/:id', () => {
    it('should delete composition when not in use', async () => {
      const testComp = await createTestComposition(testDb, { label: 'Safe to Delete' })

      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions[':id'].$delete({
        param: { id: String(testComp.id) },
      })

      expect(res.status).toBe(200)
    })

    it('should reject deletion when in use by control definitions', async () => {
      const testComp = await createTestComposition(testDb, { label: 'In Use Composition' })
      await createTestControlDefinition(testDb, testComp.id)

      const app = new Hono()
      app.route('/api/compositions', compositionsRoutes)
      const client = createTestClient(app) as any

      const res = await client.api.compositions[':id'].$delete({
        param: { id: String(testComp.id) },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('in use')
    })
  })
})


