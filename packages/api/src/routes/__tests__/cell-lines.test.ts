import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createCellLinesRoutes } from '../cell-lines'

describe('Cell Lines API', () => {
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
        app.route('/api/cell-lines', createCellLinesRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/cell-lines', () => {
    it('returns 200 and cellLines array', async () => {
      const res = await ctx.request('/api/cell-lines', { method: 'GET' })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { cellLines: unknown[] }
      expect(data).toHaveProperty('cellLines')
      expect(Array.isArray(data.cellLines)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/cell-lines', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/cell-lines/:id', () => {
    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/cell-lines/99999', { method: 'GET' })
      expect(res.status).toBe(404)
    })
  })
})
