import { Hono } from 'hono'
import type { Database } from '../db/client'
import { parseSearchFilters } from '../lib/search/parse-filters'
import { searchUnified } from '../lib/search/unified-search'
import { createAuthMiddleware } from '../middleware/auth'
import { handleRouteError, RouteError, searchFailedBody } from '../lib/error-handler'

/**
 * Create search routes with database injection
 * @param database - Database instance (required)
 */
export function createSearchRoutes(database: Database): Hono {
  const search = new Hono()
  const authMiddleware = createAuthMiddleware(database)

  search.get('/', authMiddleware, async (c) => {
    try {
      const { q, type } = parseSearchFilters(c)

      if (!q || q.length < 1) {
        return c.json({ results: [] })
      }

      const data = await searchUnified(database, q, type)
      return c.json(data)
    } catch (error: unknown) {
      return handleRouteError(
        new RouteError(500, searchFailedBody(c.req.query('q') || '', error)),
        c,
      )
    }
  })

  return search
}
