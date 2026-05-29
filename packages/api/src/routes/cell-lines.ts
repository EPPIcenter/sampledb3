import { Hono } from 'hono'
import type { Database } from '../db/client'
import { cellLine } from '../db/schema'
import { eq } from 'drizzle-orm'
import { createAuthMiddleware } from '../middleware/auth'
import { requireParam } from '../lib/common-validators'
import { handleRouteError } from '../lib/error-handler'

/**
 * Create cell lines routes with database injection
 * @param database - Database instance (required)
 */
export function createCellLinesRoutes(database: Database): Hono {
  const cellLines = new Hono()
  const authMiddleware = createAuthMiddleware(database)

  // List all cell lines
  cellLines.get('/', authMiddleware, async (c) => {
    try {
      const lines = await database.select().from(cellLine).orderBy(cellLine.name)
      return c.json({ cellLines: lines })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // Get cell line by ID
  cellLines.get('/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid cell line ID' }, 400)
    }

    try {
      const line = await database
        .select()
        .from(cellLine)
        .where(eq(cellLine.id, id))
        .get()

      if (!line) {
        return c.json({ error: 'Cell line not found' }, 404)
      }

      return c.json({ cellLine: line })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return cellLines
}

