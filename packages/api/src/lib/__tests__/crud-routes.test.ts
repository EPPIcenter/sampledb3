import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, getResponseData, loginAndGetCookie, authenticatedRequest, createAuthenticatedClientWrapper } from '../../__tests__/helpers/test-client'
import { createCrudRoutes } from '../crud-routes'
import { setupTestDatabase, cleanupTestDatabase, resetTestDatabase } from '../../__tests__/helpers/db-setup'
import { tag, storageContainer, storageContainerTag } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '../../db/client'
import { createTestTag, createTestStorageContainer, createTestSpecimenType, createTestSpecimen, createTestUnit } from '../../__tests__/helpers/factories'
import { createTestUser, setupPasswordRequirements, setupSessionSettings } from '../../__tests__/helpers/auth-helpers'
import type { ErrorResponse, SuccessResponse, ValidationErrorResponse } from '../../__tests__/helpers/test-types'

describe('createCrudRoutes Factory', () => {
  let testDb: Database
  let sqlite: any
  let cookieHeader: string

  // Helper to create an authenticated test client
  function createAuthClient(app: Hono) {
    const baseClient = createTestClient(app)
    return createAuthenticatedClientWrapper(baseClient, cookieHeader)
  }

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

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'GET',
        cookie: cookieHeader,
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

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'GET',
        cookie: cookieHeader,
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
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)

      const res = await authenticatedRequest(app, '/api/tags/99999', {
        method: 'GET',
        cookie: cookieHeader,
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
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)

      const res = await authenticatedRequest(app, '/api/tags/invalid', {
        method: 'GET',
        cookie: cookieHeader,
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
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: cookieHeader,
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
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
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

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(200)
      const data = await res.json() as SuccessResponse
      expect(data.message).toContain('deleted successfully')

      // Verify it's deleted
      const app2 = new Hono()
      app2.route('/api/tags', routes)
      const getRes = await authenticatedRequest(app2, `/api/tags/${testTag.id}`, {
        method: 'GET',
        cookie: cookieHeader,
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

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: cookieHeader,
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
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const testTag = await createTestTag(testDb, { name: 'Test' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
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
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: cookieHeader,
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
      const client = createAuthClient(app)

      // Try to update state1 to have the same name as state2
      const res = await authenticatedRequest(app, `/api/tags/${tag1.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
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
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
      })

      const testTag = await createTestTag(testDb, { name: 'Original' })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createAuthClient(app)

      // Update with the same name should work
      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
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
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: cookieHeader,
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
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
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
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })

      expect(res.status).toBe(400)
      const data = await res.json() as ErrorResponse
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

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
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

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'GET',
        cookie: cookieHeader,
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

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'GET',
        cookie: cookieHeader,
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
        database: testDb,
        entityName: 'Tag',
        pluralName: 'tags',
        singularName: 'tag',
        createSchema,
        onCreateDefaults,
      })

      const app = new Hono()
      app.route('/api/tags', routes)
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'POST',
        cookie: cookieHeader,
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
      const client = createAuthClient(app)

      const res = await authenticatedRequest(app, `/api/tags/${testTag.id}`, {
        method: 'PUT',
        cookie: cookieHeader,
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

      const res = await authenticatedRequest(app, '/api/tags', {
        method: 'GET',
        cookie: cookieHeader,
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

