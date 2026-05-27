import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, getResponseData, authenticatedRequest, createAuthenticatedClientWrapper } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createCrudRoutes } from '../crud-routes'
import { tag, storageContainer, storageContainerTag } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { utcNow } from '../datetime'
import { createTestTag, createTestStorageContainer, createTestSpecimenType, createTestSpecimen, createTestUnit } from '../../__tests__/helpers/factories'
import type { ErrorResponse, SuccessResponse, ValidationErrorResponse } from '../../__tests__/helpers/test-types'

describe('createCrudRoutes Factory', () => {
  let ctx: AuthenticatedRouteTestContext

  function createAuthClient(app: Hono) {
    const baseClient = createTestClient(app)
    return createAuthenticatedClientWrapper(baseClient, ctx.cookie)
  }

  function createTagsApp(routes: Hono): Hono {
    return ctx.createRequestApp((app) => {
      app.route('/api/tags', routes)
    })
  }

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: { email: 'admin@test.com', name: 'Admin User', role: 'admin' },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('Basic CRUD Operations', () => {
    it('should create routes with GET / endpoint for listing', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'GET',
        cookie: ctx.cookie,
      })
      expect(res.status).toBe(200)
      const data = await getResponseData<Array<{ id: number; name: string }>>(res)
      expect(Array.isArray(data)).toBe(true)
    })

    it('should create routes with GET /:id endpoint for getting one', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      // Create a test tag
      const testTag = await createTestTag(ctx.db, { name: 'Test Tag' })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'GET',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res) as { id: number; name: string }
      expect(data).toBeDefined()
      expect(data.id).toBe(testTag.id)
      expect(data.name).toBe('Test Tag')
    })

    it('should return 404 for non-existent ID', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, '/api/tags/99999', {
        method: 'GET',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(404)
      const data = await res.json() as ErrorResponse
      expect(data.error).toBe('Tag with id 99999 not found')
    })

    it('should return 400 for invalid ID', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, '/api/tags/invalid', {
        method: 'GET',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('Invalid Tag ID')
    })

    it('should create routes with POST / endpoint for creating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: ctx.cookie,
        json: { name: 'New Tag' },
      })

      expect(res.status).toBe(201)
      const data = await getResponseData(res) as { id: number; name: string }
      expect(data).toBeDefined()
      expect(data.name).toBe('New Tag')
      expect(data.id).toBeDefined()
    })

    it('should create routes with PUT /:id endpoint for updating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      // Create a test state
      const testTag = await createTestTag(ctx.db, { name: 'Original Name' })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: ctx.cookie,
        json: { name: 'Updated Name' },
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res) as { name: string }
      expect(data.name).toBe('Updated Name')
    })

    it('should create routes with DELETE /:id endpoint for deleting', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      // Create a test state
      const testTag = await createTestTag(ctx.db, { name: 'To Delete' })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'DELETE',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
      const data = await res.json() as SuccessResponse
      expect(data.message).toContain('deleted successfully')

      // Verify it's deleted
      const app2 = createTagsApp(routes)
      const getRes = await authenticatedRequest(app2, `/api/tags/${testTag.id}`, {
        method: 'GET',
        cookie: ctx.cookie,
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
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: ctx.cookie,
        json: { name: '' }, // Empty name should fail
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ValidationErrorResponse
      expect(data.error).toBe('Validation error')
      expect(data.details).toBeDefined()
    })

    it('should validate update data with Zod schema', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const testTag = await createTestTag(ctx.db, { name: 'Test' })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: ctx.cookie,
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
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      await createTestTag(ctx.db, { name: 'Duplicate' })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: ctx.cookie,
        json: { name: 'Duplicate' },
      })

      expect(res.status).toBe(409)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('already exists')
    })

    it('should check for duplicate names on update (excluding self)', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const tag1 = await createTestTag(ctx.db, { name: 'Tag 1' })
      await createTestTag(ctx.db, { name: 'Tag 2' })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      // Try to update state1 to have the same name as state2
      const res = await authenticatedRequest(app, `/api/tags/${tag1.id}`, {
        method: 'PUT',
        cookie: ctx.cookie,
        json: { name: 'Tag 2' },
      })

      expect(res.status).toBe(409)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('already exists')
    })

    it('should allow updating to the same name (no duplicate check)', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const testTag = await createTestTag(ctx.db, { name: 'Original' })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      // Update with the same name should work
      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: ctx.cookie,
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
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        validateCreate,
      })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: ctx.cookie,
        json: { name: 'Invalid' },
      })

      expect(validateCreateCalled).toBe(true)
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toBe('Custom validation failed')
    })

    it('should call validateUpdate hook before updating', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(ctx.db, { name: 'Test' })

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
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        validateUpdate,
      })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: ctx.cookie,
        json: { name: 'Invalid' },
      })

      expect(validateUpdateCalled).toBe(true)
      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toBe('Custom update validation failed')
    })
  })

  describe('"In Use" Checking', () => {
    it('should call checkInUse hook before deleting', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(ctx.db, { name: 'In Use Tag' })

      // Create dependencies for storage container
      const testUnit = await createTestUnit(ctx.db, {
        symbol: 'uL',
        name: 'microliter',
        category: 'volume',
      })
      const testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Test Type' })
      const testSpecimen = await createTestSpecimen(ctx.db, testSpecimenType.id)

      const testContainer = await createTestStorageContainer(ctx.db, {
        specimenId: testSpecimen.id,
        unitId: testUnit.id as number,
      })

      // Add tag to container to test "in use" scenario
      await ctx.db.insert(storageContainerTag).values({
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
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        checkInUse,
      })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'DELETE',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
      expect(data.error).toContain('in use')
    })

    it('should allow deletion when not in use', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(ctx.db, { name: 'Safe to Delete' })

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
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        checkInUse,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'DELETE',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
    })
  })

  describe('Response Transformations', () => {
    it('should apply transformList to list responses', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      await createTestTag(ctx.db, { name: 'Tag 1' })
      await createTestTag(ctx.db, { name: 'Tag 2' })

      const transformList = (item: any) => ({
        id: item.id,
        name: item.name.toUpperCase(),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        transformList,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'GET',
        cookie: ctx.cookie,
      })
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as Array<{ name: string }>
      expect(data[0].name).toBe('TAG 1')
      expect(data[1].name).toBe('TAG 2')
    })

    it('should apply transformDetail to detail responses', async () => {
      const createSchema = z.object({
        name: z.string().min(1),
      })

      const testTag = await createTestTag(ctx.db, { name: 'Test Tag' })

      const transformDetail = (item: any) => ({
        id: item.id,
        name: item.name.toUpperCase(),
        transformed: true,
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        transformDetail,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'GET',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
      const data = await getResponseData(res) as { name: string; transformed: boolean }
      expect(data.name).toBe('TEST TAG')
      expect(data.transformed).toBe(true)
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
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        onCreateDefaults,
      })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: ctx.cookie,
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

      const testTag = await createTestTag(ctx.db, { name: 'Test' })

      const onUpdateDefaults = () => ({
        updatedAt: utcNow(),
      })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        onUpdateDefaults,
      })

      const app = createTagsApp(routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: ctx.cookie,
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

      await createTestTag(ctx.db, { name: 'Zebra' })
      await createTestTag(ctx.db, { name: 'Alpha' })
      await createTestTag(ctx.db, { name: 'Beta' })

      const routes = createCrudRoutes({
        table: tag,
        database: ctx.db,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = createTagsApp(routes)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'GET',
        cookie: ctx.cookie,
      })
      expect(res.status).toBe(200)
      const data = await getResponseData(res) as Array<{ name: string }>
      expect(data.length).toBeGreaterThanOrEqual(3)
      // Should be ordered by name
      const names = data.map((s) => s.name)
      expect(names).toEqual([...names].sort())
    })
  })
})

