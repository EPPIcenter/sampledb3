import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createStatisticsRoutes } from '../statistics'
import { createTestSpecimen, createTestSpecimenType, createTestStorageContainer } from '../../__tests__/helpers/factories'

describe('Statistics API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/statistics', createStatisticsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/statistics', () => {
    it('returns 200 and expected shape with auth', async () => {
      const res = await ctx.request('/api/statistics', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as Record<string, unknown>
      expect(data).toBeDefined()
      expect(typeof data).toBe('object')
    })

    it('returns 200 with query filters (study, container_type)', async () => {
      const res = await ctx.request('/api/statistics?study=NONEXISTENT&container_type=micronix_tube', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as Record<string, unknown>
      expect(data).toBeDefined()
    })

    it('filters by a numeric specimen_type_id and ignores a non-numeric one or location_id', async () => {
      await createTestStorageContainer(ctx.db)
      const otherType = await createTestSpecimenType(ctx.db, { name: 'Other type' })
      const total = async (query: string) => {
        const res = await ctx.request(`/api/statistics${query}`, { method: 'GET' })
        expect(res.status).toBe(200)
        return ((await res.json()) as { specimens: { total: number } }).specimens.total
      }

      expect(await total('')).toBe(1)
      expect(await total(`?specimen_type_id=${otherType.id}`)).toBe(0)
      expect(await total('?specimen_type_id=abc&location_id=abc')).toBe(1)
    })

    it.each([
      ['collection_date_from', 'garbage'],
      ['collection_date_to', '9/7/2022'],
      ['collection_date_from', '2024'],
      ['created_to', 'soon'],
    ])('returns 400 for %s=%s, even for an unknown study', async (param, value) => {
      for (const study of ['', '&study=NONEXISTENT']) {
        const res = await ctx.request(`/api/statistics?${param}=${encodeURIComponent(value)}${study}`, { method: 'GET' })
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toContain(param)
      }
    })

    it('filters by collection date as a calendar date', async () => {
      const type = await createTestSpecimenType(ctx.db, { name: 'Dated' })
      await createTestSpecimen(ctx.db, type.id, { collectionDate: '1999-12-31' })
      await createTestSpecimen(ctx.db, type.id, { collectionDate: '2024-05-07' })

      const res = await ctx.request('/api/statistics?collection_date_to=2000-01-01', { method: 'GET' })

      expect(res.status).toBe(200)
      expect(((await res.json()) as { specimens: { total: number } }).specimens.total).toBe(1)
    })

    it('returns 401 without auth', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/statistics', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/statistics/admin', () => {
    it('returns 200 with admin auth', async () => {
      const res = await ctx.request('/api/statistics/admin', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as Record<string, unknown>
      expect(data).toBeDefined()
    })

    it('returns 401 without auth', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/statistics/admin', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })
})
