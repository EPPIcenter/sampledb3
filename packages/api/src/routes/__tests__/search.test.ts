import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createSearchRoutes } from '../search'

describe('Search API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      mount: (app, { db }) => {
        app.route('/api/search', createSearchRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/search?q=...', () => {
    it('returns 200 and results array when q is provided', async () => {
      const res = await ctx.request('/api/search?q=test')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { results: unknown[] }
      expect(data).toHaveProperty('results')
      expect(Array.isArray(data.results)).toBe(true)
    })

    it('returns 200 and empty results when q is empty', async () => {
      const res = await ctx.request('/api/search?q=')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { results: unknown[] }
      expect(data.results).toEqual([])
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/search?q=test', {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })
  })
})
