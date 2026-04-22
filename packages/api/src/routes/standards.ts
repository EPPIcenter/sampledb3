import { Hono } from 'hono'
import type { Database } from '../db/client'
import { standard } from '../db/schema'
import { eq } from 'drizzle-orm'
import { createAuthMiddleware } from '../middleware/auth'
import { requireParam } from '../lib/common-validators'

/**
 * Create standards routes with database injection
 * @param database - Database instance (required)
 */
export function createStandardsRoutes(database: Database): Hono {
  const standards = new Hono()
  const authMiddleware = createAuthMiddleware(database)

  // List all standards
  standards.get('/', authMiddleware, async (c) => {
    try {
      const standardsList = await database.select().from(standard).orderBy(standard.name)
      return c.json({ standards: standardsList })
    } catch (error: any) {
      console.error('Error fetching standards:', error)
      return c.json({ error: 'Failed to fetch standards', details: error.message }, 500)
    }
  })

  // Get standard by ID
  standards.get('/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid standard ID' }, 400)
    }

    try {
      const standardRecord = await database
        .select()
        .from(standard)
        .where(eq(standard.id, id))
        .get()

      if (!standardRecord) {
        return c.json({ error: 'Standard not found' }, 404)
      }

      return c.json({ standard: standardRecord })
    } catch (error: any) {
      console.error('Error fetching standard:', error)
      return c.json({ error: 'Failed to fetch standard', details: error.message }, 500)
    }
  })

  return standards
}

