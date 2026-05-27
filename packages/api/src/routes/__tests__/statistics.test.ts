import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createStatisticsRoutes } from '../statistics'

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
      mount: (app, { db, sqlite }) => {
        app.route('/api/statistics', createStatisticsRoutes(db, sqlite))
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
