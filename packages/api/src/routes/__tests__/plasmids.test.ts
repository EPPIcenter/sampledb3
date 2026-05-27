import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createPlasmidsRoutes } from '../plasmids'

describe('Plasmids API', () => {
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
        app.route('/api/plasmids', createPlasmidsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/plasmids', () => {
    it('returns 200 and plasmids array', async () => {
      const res = await ctx.request('/api/plasmids', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { plasmids: unknown[] }
      expect(data).toHaveProperty('plasmids')
      expect(Array.isArray(data.plasmids)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/plasmids', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/plasmids/:id', () => {
    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/plasmids/99999', { method: 'GET' })
      expect(res.status).toBe(404)
    })
  })
})
