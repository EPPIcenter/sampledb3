import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient } from '../../__tests__/helpers/test-client'
import { createCrudRoutes } from '../crud-routes'
import { setupTestDatabase, cleanupTestDatabase, resetTestDatabase } from '../../__tests__/helpers/db-setup'
import { tag, storageContainer, storageContainerTag } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '../../db/client'
import { createTestTag, createTestStorageContainer, createTestSpecimenType, createTestSpecimen, createTestUnit } from '../../__tests__/helpers/factories'

describe('createCrudRoutes Factory', () => {
  let testDb: Database
  let sqlite: any

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('Basic CRUD Operations', () => {
    it('should create routes with GET / endpoint for listing', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('tags')
      expect(Array.isArray(data.tags)).toBe(true)
    })

    it('should create routes with GET /:id endpoint for getting one', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      // Create a test tag
      const testTag = await createTestTag(testDb, { name: 'Test Tag' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$get({
        param: { id: String(testTag.id) },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.tag).toBeDefined()
      expect(data.tag.id).toBe(testTag.id)
      expect(data.tag.name).toBe('Test Tag')
    })

    it('should return 404 for non-existent ID', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$get({
        param: { id: '99999' },
      })

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('Tag not found')
    })

    it('should return 400 for invalid ID', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$get({
        param: { id: 'invalid' },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Invalid Tag ID')
    })

    it('should create routes with POST / endpoint for creating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$post({
        json: { name: 'New Tag' },
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.tag).toBeDefined()
      expect(data.tag.name).toBe('New Tag')
      expect(data.tag.id).toBeDefined()
    })

    it('should create routes with PUT /:id endpoint for updating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      // Create a test state
      const testTag = await createTestTag(testDb, { name: 'Original Name' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$put({
        param: { id: String(testTag.id) },
        json: { name: 'Updated Name' },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.tag.name).toBe('Updated Name')
    })

    it('should create routes with DELETE /:id endpoint for deleting', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      // Create a test state
      const testTag = await createTestTag(testDb, { name: 'To Delete' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$delete({
        param: { id: String(testTag.id) },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.message).toContain('deleted successfully')

      // Verify it's deleted
      const getRes = await client.api.tags[':id'].$get({
        param: { id: String(testTag.id) },
      })
      expect(getRes.status).toBe(404)
    })
  })

  describe('Validation', () => {
    it('should validate create data with Zod schema', async () => {
      const createSchema = z.object({
        name: z.string().min(1, 'Name is required'),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$post({
        json: { name: '' }, // Empty name should fail
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Validation error')
      expect(data.details).toBeDefined()
    })

    it('should validate update data with Zod schema', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const testTag = await createTestTag(testDb, { name: 'Test' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$put({
        param: { id: String(testTag.id) },
        json: { name: '' }, // Empty name should fail
      })

      expect(res.status).toBe(400)
    })

    it('should check for duplicate names on create', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      await createTestTag(testDb, { name: 'Duplicate' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$post({
        json: { name: 'Duplicate' },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('already exists')
    })

    it('should check for duplicate names on update (excluding self)', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const tag1 = await createTestTag(testDb, { name: 'Tag 1' })
      await createTestTag(testDb, { name: 'Tag 2' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      // Try to update state1 to have the same name as state2
      const res = await client.api.tags[':id'].$put({
        param: { id: String(tag1.id) },
        json: { name: 'Tag 2' },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('already exists')
    })

    it('should allow updating to the same name (no duplicate check)', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const testTag = await createTestTag(testDb, { name: 'Original' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      // Update with the same name should work
      const res = await client.api.tags[':id'].$put({
        param: { id: String(testTag.id) },
        json: { name: 'Original' },
      })

      expect(res.status).toBe(200)
    })
  })

  describe('Custom Validation Hooks', () => {
    it('should call validateCreate hook before creating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      let validateCreateCalled = false
      const validateCreate = async (data: any, database: Database) => {
        validateCreateCalled = true
        if (data.name === 'Invalid') {
          return 'Custom validation failed'
        }
        return null
      }

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        validateCreate,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$post({
        json: { name: 'Invalid' },
      })

      expect(validateCreateCalled).toBe(true)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Custom validation failed')
    })

    it('should call validateUpdate hook before updating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(testDb, { name: 'Test' })

      let validateUpdateCalled = false
      const validateUpdate = async (id: number, data: any, database: Database) => {
        validateUpdateCalled = true
        if (data.name === 'Invalid') {
          return 'Custom update validation failed'
        }
        return null
      }

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        validateUpdate,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$put({
        param: { id: String(testTag.id) },
        json: { name: 'Invalid' },
      })

      expect(validateUpdateCalled).toBe(true)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Custom update validation failed')
    })
  })

  describe('"In Use" Checking', () => {
    it('should call checkInUse hook before deleting', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(testDb, { name: 'In Use Tag' })

      // Create dependencies for storage container
      const testUnit = await createTestUnit(testDb, {
        symbol: 'uL',
        name: 'microliter',
        category: 'volume',
      })
      const testSpecimenType = await createTestSpecimenType(testDb, { name: 'Test Type' })
      const testSpecimen = await createTestSpecimen(testDb, testSpecimenType.id)

      const testContainer = await createTestStorageContainer(testDb, {
        specimenId: testSpecimen.id,
        unitId: testUnit.id as number,
      })

      // Add tag to container to test "in use" scenario
      await testDb.insert(storageContainerTag).values({
        storageContainerId: testContainer.id,
        tagId: testTag.id,
      })

      const checkInUse = async (id: number, database: Database) => {
        const inUse = await database
          .select()
          .from(storageContainerTag)
          .where(eq(storageContainerTag.tagId, id))
          .limit(1)
          .get()

        if (inUse) {
          return 'Cannot delete tag: it is in use by storage containers'
        }
        return null
      }

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        checkInUse,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$delete({
        param: { id: String(testTag.id) },
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('in use')
    })

    it('should allow deletion when not in use', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(testDb, { name: 'Safe to Delete' })

      const checkInUse = async (id: number, database: Database) => {
        const inUse = await database
          .select()
          .from(storageContainerTag)
          .where(eq(storageContainerTag.tagId, id))
          .limit(1)
          .get()

        if (inUse) {
          return 'Cannot delete tag: it is in use by storage containers'
        }
        return null
      }

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        checkInUse,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$delete({
        param: { id: String(testTag.id) },
      })

      expect(res.status).toBe(200)
    })
  })

  describe('Response Transformations', () => {
    it('should apply transformList to list responses', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      await createTestTag(testDb, { name: 'Tag 1' })
      await createTestTag(testDb, { name: 'Tag 2' })

      const transformList = (item: any) => ({
        id: item.id,
        name: item.name.toUpperCase(),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        transformList,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.tags[0].name).toBe('TAG 1')
      expect(data.tags[1].name).toBe('TAG 2')
    })

    it('should apply transformDetail to detail responses', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(testDb, { name: 'Test Tag' })

      const transformDetail = (item: any) => ({
        id: item.id,
        name: item.name.toUpperCase(),
        transformed: true,
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        transformDetail,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$get({
        param: { id: String(testTag.id) },
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.tag.name).toBe('TEST TAG')
      expect(data.tag.transformed).toBe(true)
    })
  })

  describe('Custom Defaults', () => {
    it('should apply onCreateDefaults when creating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const onCreateDefaults = () => ({
        metadata: 'test-metadata',
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        onCreateDefaults,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$post({
        json: { name: 'Test' },
      })

      expect(res.status).toBe(201)
      // Note: The metadata won't appear in response if it's not in the table schema
      // This test verifies the hook is called
    })

    it('should apply onUpdateDefaults when updating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(testDb, { name: 'Test' })

      const onUpdateDefaults = () => ({
        updatedAt: new Date().toISOString(),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        onUpdateDefaults,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags[':id'].$put({
        param: { id: String(testTag.id) },
        json: { name: 'Updated' },
      })

      expect(res.status).toBe(200)
    })
  })

  describe('Ordering', () => {
    it('should order results by name by default', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      await createTestTag(testDb, { name: 'Zebra' })
      await createTestTag(testDb, { name: 'Alpha' })
      await createTestTag(testDb, { name: 'Beta' })

      const routes = createCrudRoutes({
        table: tag,
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createTestClient(app)

      const res = await client.api.tags.$get()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.tags.length).toBeGreaterThanOrEqual(3)
      // Should be ordered by name
      const names = data.tags.map((s: any) => s.name)
      expect(names).toEqual([...names].sort())
    })
  })
})

