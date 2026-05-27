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
import { createTestStrain } from '../../__tests__/helpers/factories'
import { createCrudRoutes } from '../../lib/crud-routes'
import { strain } from '../../db/schema'
import { z } from 'zod'

describe('Strains API', () => {
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
        const strainsRoutes = createCrudRoutes({
          table: strain,
          database: db,
          entityName: 'Strain',
          pluralName: 'strains',
          singularName: 'strain',
          createSchema,
        })
        app.route('/api/strains', strainsRoutes)
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  function createApp(): Hono {
    return ctx.createRequestApp()
  }

  describe('GET /strains', () => {
    it('should return empty array when no strains exist', async () => {
      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'GET',
        cookie: ctx.cookie,
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as any
      expect(data).toEqual([])
    })

    it('should return all strains ordered by name', async () => {
      await createTestStrain(ctx.db, { name: 'Strain A', description: 'Description A' })
      await createTestStrain(ctx.db, { name: 'Strain B' })

      const app = createApp()

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'GET',
        cookie: ctx.cookie,
      })
      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as any
      expect(data).toHaveLength(2)
      expect(data[0].name).toBe('Strain A')
    })
  })

  describe('POST /strains', () => {
    it('should create a new strain', async () => {
      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          name: 'New Strain',
          description: 'Test description',
        },
      })

      expect(res.status).toBe(201)
      const data = (await getResponseData(res)) as any
      expect(data.name).toBe('New Strain')
      expect(data.description).toBe('Test description')
    })

    it('should reject duplicate names', async () => {
      await createTestStrain(ctx.db, { name: 'Existing Strain' })

      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, '/api/strains', {
        method: 'POST',
        cookie: ctx.cookie,
        json: {
          name: 'Existing Strain',
        },
      })

      expect(res.status).toBe(409)
      const data = (await res.json()) as any
      expect(data.error).toContain('already exists')
    })
  })

  describe('GET /strains/:id', () => {
    it('should return strain by ID', async () => {
      const testStrain = await createTestStrain(ctx.db, { name: 'Test Strain' })

      const app = createApp()

      const res = await authenticatedRequest(app, `/api/strains/${testStrain.id}`, {
        method: 'GET',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
      const data = (await getResponseData(res)) as any
      expect(data.id).toBe(testStrain.id)
      expect(data.name).toBe('Test Strain')
    })
  })

  describe('PUT /strains/:id', () => {
    it('should update strain', async () => {
      const testStrain = await createTestStrain(ctx.db, { name: 'Original' })

      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, `/api/strains/${testStrain.id}`, {
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
    })
  })

  describe('DELETE /strains/:id', () => {
    it('should delete strain when not in use', async () => {
      const testStrain = await createTestStrain(ctx.db, { name: 'Safe to Delete' })

      const app = createApp()
      const baseClient = createTestClient(app) as any
      const client = createAuthenticatedClientWrapper(baseClient, ctx.cookie)

      const res = await authenticatedRequest(app, `/api/strains/${testStrain.id}`, {
        method: 'DELETE',
        cookie: ctx.cookie,
      })

      expect(res.status).toBe(200)
    })

    // Note: Compositions are no longer used - strains are now embedded in control definitions via properties JSON
    // If we need to check for "in use" scenarios in the future, we would check control definitions' properties JSON
  })
})
