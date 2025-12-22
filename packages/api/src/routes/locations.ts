import { Hono } from 'hono'
import { db } from '../db/client'
import { location, micronixPlate, cryovialBox, box, bag } from '../db/schema'
import { eq, and, sql, or, like, desc } from 'drizzle-orm'
import { validatePage, validateLimit } from '../lib/constants'
import { z } from 'zod'

const locations = new Hono()

// List all locations
locations.get('/', async (c) => {
  try {
    const search = c.req.query('search')
    // Make pagination optional: if neither page nor limit is provided, return all locations
    const hasPagination = c.req.query('page') !== undefined || c.req.query('limit') !== undefined
    const page = hasPagination ? validatePage(c.req.query('page')) : 1
    const limit = hasPagination ? validateLimit(c.req.query('limit')) : undefined
    const offset = hasPagination ? (page - 1) * limit! : undefined
    
    let query = db.select().from(location)
    let countQuery = db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(location)
    
    // Multi-word AND search: split by spaces, all words must match
    if (search && search.trim()) {
      const searchWords = search.trim().split(/\s+/).filter(word => word.length > 0)
      
      if (searchWords.length > 0) {
        // Build conditions for each word - each word must match at least one field
        const wordConditions = searchWords.map(word => {
          const pattern = `%${word}%`
          return or(
            like(location.locationRoot, pattern),
            like(location.levelI, pattern),
            like(location.levelII, pattern),
            like(location.levelIII, pattern),
            like(location.storageTypeId, pattern),
            like(location.description, pattern)
          )!
        })
        
        // All word conditions must be true (AND logic)
        const searchCondition = and(...wordConditions) as any
        query = query.where(searchCondition) as any
        countQuery = countQuery.where(searchCondition) as any
      }
    }
    
    // Apply pagination only if requested
    if (hasPagination && limit !== undefined) {
      query = query.limit(limit).offset(offset!) as any
    }
    
    const [locationsList, countResult] = await Promise.all([
      query,
      countQuery,
    ])
    
    const total = countResult[0]?.count || 0
    
    return c.json({
      locations: locationsList,
      pagination: {
        page,
        limit: limit || total,
        total,
        totalPages: hasPagination && limit !== undefined ? Math.ceil(total / limit) : 1,
      },
    })
  } catch (error: any) {
    console.error('Error fetching locations:', error)
    return c.json({ error: 'Failed to fetch locations', details: error.message }, 500)
  }
})

// Get location by ID
locations.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid location ID' }, 400)
  }

  const locationRecord = await db
    .select()
    .from(location)
    .where(eq(location.id, id))
    .get()

  if (!locationRecord) {
    return c.json({ error: 'Location not found' }, 404)
  }

  // Get contents of this location with pagination support for all collection types
  const defaultLimit = 25
  
  // Pagination parameters for each collection type
  const platesPage = validatePage(c.req.query('plates_page') || '1')
  const platesLimit = validateLimit(c.req.query('plates_limit') || String(defaultLimit))
  const platesOffset = (platesPage - 1) * platesLimit

  const cryovialBoxesPage = validatePage(c.req.query('cryovial_boxes_page') || '1')
  const cryovialBoxesLimit = validateLimit(c.req.query('cryovial_boxes_limit') || String(defaultLimit))
  const cryovialBoxesOffset = (cryovialBoxesPage - 1) * cryovialBoxesLimit

  const boxesPage = validatePage(c.req.query('boxes_page') || '1')
  const boxesLimit = validateLimit(c.req.query('boxes_limit') || String(defaultLimit))
  const boxesOffset = (boxesPage - 1) * boxesLimit

  const bagsPage = validatePage(c.req.query('bags_page') || '1')
  const bagsLimit = validateLimit(c.req.query('bags_limit') || String(defaultLimit))
  const bagsOffset = (bagsPage - 1) * bagsLimit

  // Get total counts for pagination
  const [platesCountResult, cryovialBoxesCountResult, boxesCountResult, bagsCountResult] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(micronixPlate).where(eq(micronixPlate.locationId, id)),
    db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(cryovialBox).where(eq(cryovialBox.locationId, id)),
    db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(box).where(eq(box.locationId, id)),
    db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(bag).where(eq(bag.locationId, id)),
  ])

  const platesTotal = platesCountResult[0]?.count || 0
  const cryovialBoxesTotal = cryovialBoxesCountResult[0]?.count || 0
  const boxesTotal = boxesCountResult[0]?.count || 0
  const bagsTotal = bagsCountResult[0]?.count || 0

  // Fetch paginated results
  const plates = await db
    .select()
    .from(micronixPlate)
    .where(eq(micronixPlate.locationId, id))
    .limit(platesLimit)
    .offset(platesOffset)

  const cryovialBoxes = await db
    .select()
    .from(cryovialBox)
    .where(eq(cryovialBox.locationId, id))
    .limit(cryovialBoxesLimit)
    .offset(cryovialBoxesOffset)

  const regularBoxes = await db
    .select()
    .from(box)
    .where(eq(box.locationId, id))
    .orderBy(desc(box.id))
    .limit(boxesLimit)
    .offset(boxesOffset)

  const bags = await db
    .select()
    .from(bag)
    .where(eq(bag.locationId, id))
    .limit(bagsLimit)
    .offset(bagsOffset)

  return c.json({
    location: locationRecord,
    contents: {
      micronixPlates: plates,
      cryovialBoxes: cryovialBoxes,
      boxes: regularBoxes,
      bags: bags,
    },
    pagination: {
      micronixPlates: {
        page: platesPage,
        limit: platesLimit,
        total: platesTotal,
        totalPages: Math.ceil(platesTotal / platesLimit),
      },
      cryovialBoxes: {
        page: cryovialBoxesPage,
        limit: cryovialBoxesLimit,
        total: cryovialBoxesTotal,
        totalPages: Math.ceil(cryovialBoxesTotal / cryovialBoxesLimit),
      },
      boxes: {
        page: boxesPage,
        limit: boxesLimit,
        total: boxesTotal,
        totalPages: Math.ceil(boxesTotal / boxesLimit),
      },
      bags: {
        page: bagsPage,
        limit: bagsLimit,
        total: bagsTotal,
        totalPages: Math.ceil(bagsTotal / bagsLimit),
      },
    },
  })
})

// Create new location
locations.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      locationRoot: z.string().min(1, 'Location root is required'),
      storageTypeId: z.coerce.string().min(1, 'Storage type ID is required'),
      description: z.string().optional().nullable(),
      levelI: z.string().min(1, 'Level I is required'),
      levelII: z.string().min(1, 'Level II is required'),
      levelIII: z.string().optional().nullable(),
    })

    const data = schema.parse(body)

    const now = new Date().toISOString()
    const result = await db
      .insert(location)
      .values({
        ...data,
        created: now,
        lastUpdated: now,
      })
      .returning()

    return c.json({ location: result[0] }, 201)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error creating location:', error)
    return c.json({ error: 'Failed to create location', details: error.message }, 500)
  }
})

// Update location
locations.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid location ID' }, 400)
  }

  try {
    const body = await c.req.json()
    const schema = z.object({
      locationRoot: z.string().min(1, 'Location root is required'),
      storageTypeId: z.coerce.string().min(1, 'Storage type ID is required'),
      description: z.string().optional().nullable(),
      levelI: z.string().min(1, 'Level I is required'),
      levelII: z.string().min(1, 'Level II is required'),
      levelIII: z.string().optional().nullable(),
    })

    const data = schema.parse(body)

    // Check if location exists
    const existing = await db
      .select()
      .from(location)
      .where(eq(location.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Location not found' }, 404)
    }

    const result = await db
      .update(location)
      .set({
        ...data,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(location.id, id))
      .returning()

    return c.json({ location: result[0] })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error updating location:', error)
    return c.json({ error: 'Failed to update location', details: error.message }, 500)
  }
})

// Delete location
locations.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid location ID' }, 400)
  }

  try {
    // Check if location is in use
    const [hasPlates, hasCryovialBoxes, hasBoxes, hasBags] = await Promise.all([
      db.select().from(micronixPlate).where(eq(micronixPlate.locationId, id)).limit(1).get(),
      db.select().from(cryovialBox).where(eq(cryovialBox.locationId, id)).limit(1).get(),
      db.select().from(box).where(eq(box.locationId, id)).limit(1).get(),
      db.select().from(bag).where(eq(bag.locationId, id)).limit(1).get(),
    ])

    if (hasPlates || hasCryovialBoxes || hasBoxes || hasBags) {
      return c.json({ error: 'Cannot delete location: it is in use by storage containers' }, 400)
    }

    const result = await db
      .delete(location)
      .where(eq(location.id, id))
      .returning()

    if (result.length === 0) {
      return c.json({ error: 'Location not found' }, 404)
    }

    return c.json({ message: 'Location deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting location:', error)
    return c.json({ error: 'Failed to delete location', details: error.message }, 500)
  }
})

export default locations
