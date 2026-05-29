import { Hono } from 'hono'
import type { Database } from '../db/client'
import { reagent } from '../db/schema'
import { eq, and, lte } from 'drizzle-orm'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'
import { requireParam } from '../lib/common-validators'
import { handleRouteError } from '../lib/error-handler'

/**
 * Create reagents routes with database injection
 * @param database - Database instance (required)
 */
export function createReagentsRoutes(database: Database): Hono {
  const reagents = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

  // List all reagents
  reagents.get('/', authMiddleware, async (c) => {
    const type = c.req.query('type')
    const expiringWithinDays = c.req.query('expiring_within_days')
    
    let query = database.select().from(reagent)
  
  const conditions = []
  
  if (type) {
    conditions.push(eq(reagent.reagentType, type))
  }
  
  if (expiringWithinDays) {
    const days = parseInt(expiringWithinDays)
    if (!isNaN(days)) {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + days)
      const dateStr = futureDate.toISOString().split('T')[0]
      conditions.push(
        sql`${reagent.expirationDate} IS NOT NULL AND ${reagent.expirationDate} <= ${dateStr}`
      )
    }
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions) as any) as any
  }
  
  const reagents = await query
  
  return c.json({ reagents })
})

// Get reagent by ID
reagents.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid reagent ID' }, 400)
  }

    const reagentRecord = await database
      .select()
      .from(reagent)
      .where(eq(reagent.id, id))
      .get()

  if (!reagentRecord) {
    return c.json({ error: 'Reagent not found' }, 404)
  }

  return c.json({ reagent: reagentRecord })
})

// Create reagent
reagents.post('/', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      reagentType: z.enum(['antibody', 'primer', 'probe', 'enzyme', 'buffer']),
      vendor: z.string().optional(),
      catalogNumber: z.string().optional(),
      lotNumber: z.string().optional(),
      receivedDate: z.string().optional(),
      expirationDate: z.string().optional(),
      storageTemp: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
    
    const data = schema.parse(body)
    const user = c.get('user')
    
    const [newReagent] = await database
      .insert(reagent)
      .values({
        ...data,
        createdBy: user?.id,
        updatedBy: user?.id,
      })
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (!newReagent) {
      throw new Error('Insert did not return reagent row')
    }
    return c.json({ reagent: newReagent }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Update reagent
reagents.patch('/:id', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid reagent ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).optional(),
      reagentType: z.enum(['antibody', 'primer', 'probe', 'enzyme', 'buffer']).optional(),
      vendor: z.string().optional(),
      catalogNumber: z.string().optional(),
      lotNumber: z.string().optional(),
      receivedDate: z.string().optional(),
      expirationDate: z.string().optional(),
      storageTemp: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
    
    const data = schema.parse(body)
    const user = c.get('user')
    
    const [updated] = await database
      .update(reagent)
      .set({
        ...data,
        lastUpdated: utcNow(),
        updatedBy: user?.id,
      })
      .where(eq(reagent.id, id))
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: update must return row
    if (!updated) {
      return c.json({ error: 'Reagent not found' }, 404)
    }
    return c.json({ reagent: updated })
  } catch (error) {
    return handleRouteError(error, c)
  }
  })

  return reagents
}
