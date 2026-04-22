import { Hono } from 'hono'
import type { Database } from '../db/client'
import { plasmid } from '../db/schema'
import { eq } from 'drizzle-orm'
import { createAuthMiddleware } from '../middleware/auth'
import { requireParam } from '../lib/common-validators'

/**
 * Create plasmids routes with database injection
 * @param database - Database instance (required)
 */
export function createPlasmidsRoutes(database: Database): Hono {
  const plasmids = new Hono()
  const authMiddleware = createAuthMiddleware(database)

  // List all plasmids
  plasmids.get('/', authMiddleware, async (c) => {
    try {
      const plasmidsList = await database.select().from(plasmid).orderBy(plasmid.name)
      return c.json({ plasmids: plasmidsList })
    } catch (error: any) {
      console.error('Error fetching plasmids:', error)
      return c.json({ error: 'Failed to fetch plasmids', details: error.message }, 500)
    }
  })

  // Get plasmid by ID
  plasmids.get('/:id', authMiddleware, async (c) => {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid plasmid ID' }, 400)
    }

    try {
      const plasmidRecord = await database
        .select()
        .from(plasmid)
        .where(eq(plasmid.id, id))
        .get()

      if (!plasmidRecord) {
        return c.json({ error: 'Plasmid not found' }, 404)
      }

      return c.json({ plasmid: plasmidRecord })
    } catch (error: any) {
      console.error('Error fetching plasmid:', error)
      return c.json({ error: 'Failed to fetch plasmid', details: error.message }, 500)
    }
  })

  return plasmids
}

