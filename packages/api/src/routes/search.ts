import { Hono } from 'hono'
import type { Database } from '../db/client'
import { parseSearchFilters } from '../lib/search/parse-filters'
import { searchUnified } from '../lib/search/unified-search'
import { createAuthMiddleware } from '../middleware/auth'

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
      console.error('Error in search:', error)
      const isDevelopment = process.env.NODE_ENV !== 'production'
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      return c.json(
        {
          error: 'Search failed',
          query: c.req.query('q') || '',
          ...(isDevelopment && {
            details: errorMessage,
            stack: errorStack,
          }),
          ...(!isDevelopment && {
            errorCode: 'SEARCH_ERROR',
          }),
        },
        500,
      )
    }
  })

  return search
}
