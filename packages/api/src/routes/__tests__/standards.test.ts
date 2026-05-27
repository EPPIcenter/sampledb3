import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createStandardsRoutes } from '../standards'

describe('Standards API', () => {
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
        app.route('/api/standards', createStandardsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/standards', () => {
    it('returns 200 and standards array', async () => {
      const res = await ctx.request('/api/standards', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { standards: unknown[] }
      expect(data).toHaveProperty('standards')
      expect(Array.isArray(data.standards)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/standards', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/standards/:id', () => {
    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/standards/99999', { method: 'GET' })
      expect(res.status).toBe(404)
    })
  })
})
