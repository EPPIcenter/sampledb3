import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createSearchRoutes } from '../search'
import { errorLogs } from '../../db/schema'
import * as unifiedSearch from '../../lib/search/unified-search'

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

    it('returns 500 with search error shape when search fails', async () => {
      vi.spyOn(unifiedSearch, 'searchUnified').mockRejectedValueOnce(new Error('db down'))
      const res = await ctx.request('/api/search?q=flu')
      expect(res.status).toBe(500)
      const data = (await res.json()) as {
        error: string
        query: string
        details?: string
        errorCode?: string
      }
      expect(data.error).toBe('Search failed')
      expect(data.query).toBe('flu')
      expect(data.details).toBe('db down')
      vi.restoreAllMocks()
    })

    it('logs the cause of a failed search to error_logs', async () => {
      vi.spyOn(unifiedSearch, 'searchUnified').mockRejectedValueOnce(new Error('db down'))

      await ctx.request('/api/search?q=flu')

      await new Promise((resolve) => setTimeout(resolve, 50))
      const rows = await ctx.db.select().from(errorLogs).where(eq(errorLogs.message, 'Search failed'))
      expect(rows).toHaveLength(1)
      expect(rows[0].stack).toContain('db down')
      vi.restoreAllMocks()
    })
  })
})
