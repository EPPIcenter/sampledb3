import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createLocationsRoutes } from '../locations'
import { createTestStorageType, createTestLocation } from '../../__tests__/helpers/factories'
import { location } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Locations API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'user@test.com',
        name: 'User',
        password: 'password123',
        role: 'member',
      },
      additionalUsers: [
        { key: 'admin', email: 'admin@test.com', name: 'Admin', password: 'password123', role: 'admin' },
      ],
      settings: { pagination: true },
      mount: (app, { db, sqlite }) => {
        app.route('/api/locations', createLocationsRoutes(db, sqlite))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/locations', () => {
    it('returns 200 and locations array with pagination', async () => {
      const res = await ctx.request('/api/locations', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { locations: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('locations')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.locations)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/locations', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/locations/:id', () => {
    it('returns 200 and location when found', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Root',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
        path: 'Root',
      })
      const res = await ctx.request(`/api/locations/${loc.id}`, {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { location: { id: number; name: string } }
      expect(data.location).toBeDefined()
      expect(data.location.id).toBe(loc.id)
      expect(data.location.name).toBe('Root')
    })

    it('returns 404 when location does not exist', async () => {
      const res = await ctx.request('/api/locations/99999', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/locations/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('storage type on root and child locations', () => {
    it('creates a root location when parentId is omitted', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const res = await ctx.request('/api/locations', {
        method: 'POST',
        cookie: ctx.cookies.admin,
        json: { name: 'Root A', storageTypeId: String(storageType.id), canContainCollections: false },
      })
      expect(res.status).toBe(201)
    })

    it('moves a root location under a parent without sending storageTypeId', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const parent = await createTestLocation(ctx.db, { name: 'Parent', storageTypeId: String(storageType.id) })
      const root = await createTestLocation(ctx.db, { name: 'Other Root', storageTypeId: String(storageType.id) })

      const res = await ctx.request(`/api/locations/${root.id}`, {
        method: 'PUT',
        cookie: ctx.cookies.admin,
        json: { parentId: parent.id },
      })

      expect(res.status).toBe(200)
      const [row] = await ctx.db.select().from(location).where(eq(location.id, root.id))
      expect(row.parentId).toBe(parent.id)
      expect(row.storageTypeId).toBeNull()
    })
  })
})
