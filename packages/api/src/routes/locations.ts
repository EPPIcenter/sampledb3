import { Hono } from 'hono'
import { db } from '../db/client'
import { location, micronixPlate, cryovialBox, box, bag, storageType } from '../db/schema'
import { eq, and, sql, or, like, desc, isNull, inArray } from 'drizzle-orm'
import { validatePage, validateLimit } from '../lib/constants'
import { z } from 'zod'
import {
  buildLocationPath,
  getLocationAncestors,
  getLocationDescendants,
  getLocationChildren,
  validateLocationHierarchy,
  updateLocationPath,
  getLocationStorageTypeId,
  getLocationHierarchyStats,
} from '../lib/location-helpers'

const locations = new Hono()

// List all locations
locations.get('/', async (c) => {
  try {
    const search = c.req.query('search')
    // Make pagination optional: if neither page nor limit is provided, return all locations
    const hasPagination = c.req.query('page') !== undefined || c.req.query('limit') !== undefined
    const page = hasPagination ? validatePage(c.req.query('page')) : 1
    const limit = hasPagination ? await validateLimit(c.req.query('limit')) : undefined
    const offset = hasPagination ? (page - 1) * limit! : undefined
    
    let query = db.select().from(location)
    let countQuery = db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(location)
    
    // Multi-word AND search: split by spaces, all words must match
    if (search && search.trim()) {
      const searchWords = search.trim().split(/\s+/).filter(word => word.length > 0)
      
      if (searchWords.length > 0) {
        // Build conditions for each word - each word must match at least one field
        // Note: storageTypeId is only on root locations, so we search it but it may be null
        const wordConditions = searchWords.map(word => {
          const pattern = `%${word}%`
          return or(
            like(location.name, pattern),
            like(location.path, pattern),
            sql`${location.storageTypeId} LIKE ${pattern}`, // Handle nullable storageTypeId
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
    
    // Get storage type names for all locations that have storageTypeId
    const storageTypeIds = [...new Set(locationsList.map(l => l.storageTypeId).filter(Boolean) as string[])]
    const storageTypes = storageTypeIds.length > 0
      ? await db.select().from(storageType).where(inArray(storageType.id, storageTypeIds.map(id => parseInt(id))))
      : []
    const storageTypeMap = new Map(storageTypes.map(st => [String(st.id), st.name]))
    
    // Enrich locations with storage type names and effective storage types
    const enrichedLocations = await Promise.all(
      locationsList.map(async (loc) => {
        // Get effective storage type (from root)
        const effectiveStorageTypeId = await getLocationStorageTypeId(loc.id)
        const effectiveStorageTypeName = effectiveStorageTypeId
          ? storageTypeMap.get(effectiveStorageTypeId) || null
          : null
        
        return {
          ...loc,
          storageTypeName: loc.storageTypeId ? storageTypeMap.get(loc.storageTypeId) || null : null,
          effectiveStorageTypeId,
          effectiveStorageTypeName,
        }
      })
    )
    
    return c.json({
      locations: enrichedLocations,
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

  // Get children, ancestors, path, and effective storage type
  const [children, ancestors, computedPath, effectiveStorageTypeId] = await Promise.all([
    getLocationChildren(id),
    getLocationAncestors(id),
    buildLocationPath(id),
    getLocationStorageTypeId(id),
  ])

  // Get storage type name if we have a storage type ID
  let storageTypeName: string | null = null
  if (effectiveStorageTypeId) {
    const st = await db
      .select()
      .from(storageType)
      .where(eq(storageType.id, parseInt(effectiveStorageTypeId)))
      .get()
    storageTypeName = st?.name || null
  }

  // Get contents of this location with pagination support for all collection types
  const defaultLimit = 25
  
  // Pagination parameters for each collection type
  const platesPage = validatePage(c.req.query('plates_page') || '1')
  const platesLimit = await validateLimit(c.req.query('plates_limit') || String(defaultLimit))
  const platesOffset = (platesPage - 1) * platesLimit

  const cryovialBoxesPage = validatePage(c.req.query('cryovial_boxes_page') || '1')
  const cryovialBoxesLimit = await validateLimit(c.req.query('cryovial_boxes_limit') || String(defaultLimit))
  const cryovialBoxesOffset = (cryovialBoxesPage - 1) * cryovialBoxesLimit

  const boxesPage = validatePage(c.req.query('boxes_page') || '1')
  const boxesLimit = await validateLimit(c.req.query('boxes_limit') || String(defaultLimit))
  const boxesOffset = (boxesPage - 1) * boxesLimit

  const bagsPage = validatePage(c.req.query('bags_page') || '1')
  const bagsLimit = await validateLimit(c.req.query('bags_limit') || String(defaultLimit))
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

  // Get hierarchy statistics
  const hierarchyStats = await getLocationHierarchyStats(id)

  return c.json({
    location: {
      ...locationRecord,
      path: locationRecord.path || computedPath,
      effectiveStorageTypeId: effectiveStorageTypeId || locationRecord.storageTypeId, // Include effective storage type
      effectiveStorageTypeName: storageTypeName, // Include storage type name
    },
    children,
    ancestors,
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
    hierarchyStats,
  })
})

// Create new location
locations.post('/', async (c) => {
  try {
    const body = await c.req.json()
    // Only root locations (parentId is null) require storageTypeId
    const schema = z.object({
      parentId: z.number().nullable().optional(),
      name: z.string().min(1, 'Name is required'),
      storageTypeId: z.coerce.string().optional().nullable(),
      description: z.string().optional().nullable(),
      canContainCollections: z.boolean().optional().default(false),
    }).refine(
      (data) => {
        // If parentId is null (root location), storageTypeId is required
        // If parentId is not null (child location), storageTypeId must be null
        if (data.parentId === null || data.parentId === undefined) {
          return data.storageTypeId !== null && data.storageTypeId !== undefined && data.storageTypeId !== ''
        } else {
          return data.storageTypeId === null || data.storageTypeId === undefined || data.storageTypeId === ''
        }
      },
      {
        message: 'Storage type ID is required for root locations and must be null for child locations',
      }
    )

    const data = schema.parse(body)

    // Validate parent exists and no circular reference
    const validationError = await validateLocationHierarchy(data.parentId ?? null)
    if (validationError) {
      return c.json({ error: validationError }, 400)
    }

    // Check for duplicate name under same parent
    const existing = await db
      .select()
      .from(location)
      .where(
        and(
          eq(location.name, data.name),
          data.parentId === null || data.parentId === undefined 
            ? isNull(location.parentId) 
            : eq(location.parentId, data.parentId)
        )
      )
      .get()

    if (existing) {
      return c.json({ error: 'Location with this name already exists under the same parent' }, 400)
    }

    const now = new Date().toISOString()
    const result = await db
      .insert(location)
      .values({
        parentId: data.parentId ?? null,
        name: data.name,
        storageTypeId: data.parentId === null ? data.storageTypeId : null, // Only set for root locations
        description: data.description ?? null,
        canContainCollections: data.canContainCollections ?? false,
        created: now,
        lastUpdated: now,
      })
      .returning()

    // Handle RunResult type - could be array or single result
    const insertResult = Array.isArray(result) ? result : [result]
    if (insertResult.length === 0) {
      return c.json({ error: 'Failed to create location' }, 500)
    }

    // Update path for this location and descendants
    await updateLocationPath(insertResult[0].id)

    // Fetch the created location with updated path
    const created = await db
      .select()
      .from(location)
      .where(eq(location.id, insertResult[0].id))
      .get()

    return c.json({ location: created }, 201)
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
    // Only root locations (parentId is null) require storageTypeId
    const schema = z.object({
      parentId: z.number().nullable().optional(),
      name: z.string().min(1, 'Name is required').optional(),
      storageTypeId: z.coerce.string().optional().nullable(),
      description: z.string().optional().nullable(),
      canContainCollections: z.boolean().optional(),
    }).refine(
      (data) => {
        // If parentId is being set to null (becoming root), storageTypeId is required
        // If parentId is being set to non-null (becoming child), storageTypeId must be null
        // If parentId is not being changed, validate based on current state
        if (data.parentId !== undefined) {
          if (data.parentId === null) {
            return data.storageTypeId !== null && data.storageTypeId !== undefined && data.storageTypeId !== ''
          } else {
            return data.storageTypeId === null || data.storageTypeId === undefined || data.storageTypeId === ''
          }
        } else {
          // parentId not being changed - validate based on existing location
          // This will be checked after we fetch the existing location
          return true
        }
      },
      {
        message: 'Storage type ID is required for root locations and must be null for child locations',
      }
    )

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

    // Validate parent if being changed
    if (data.parentId !== undefined) {
      const validationError = await validateLocationHierarchy(data.parentId ?? null, id)
      if (validationError) {
        return c.json({ error: validationError }, 400)
      }
    }

    // Determine final parentId and storageTypeId
    const finalParentId = data.parentId !== undefined ? (data.parentId ?? null) : existing.parentId
    const isRoot = finalParentId === null
    
    // Validate storageTypeId based on whether location is root or child
    if (data.storageTypeId !== undefined) {
      if (isRoot && (data.storageTypeId === null || data.storageTypeId === '')) {
        return c.json({ error: 'Storage type ID is required for root locations' }, 400)
      }
      if (!isRoot && data.storageTypeId !== null && data.storageTypeId !== '') {
        return c.json({ error: 'Storage type ID must be null for child locations' }, 400)
      }
    }

    // Check for duplicate name if name or parent is being changed
    if (data.name !== undefined || data.parentId !== undefined) {
      const newName = data.name ?? existing.name
      const newParentId = finalParentId
      
      const duplicate = await db
        .select()
        .from(location)
        .where(
          and(
            eq(location.name, newName),
            newParentId === null ? isNull(location.parentId) : eq(location.parentId, newParentId),
            sql`${location.id} != ${id}`
          )
        )
        .get()

      if (duplicate) {
        return c.json({ error: 'Location with this name already exists under the same parent' }, 400)
      }
    }

    // Build update object
    const updateData: any = {
      lastUpdated: new Date().toISOString(),
    }
    if (data.parentId !== undefined) updateData.parentId = data.parentId ?? null
    if (data.name !== undefined) updateData.name = data.name
    // Only set storageTypeId for root locations
    if (data.storageTypeId !== undefined) {
      updateData.storageTypeId = isRoot ? data.storageTypeId : null
    }
    if (data.description !== undefined) updateData.description = data.description ?? null
    if (data.canContainCollections !== undefined) updateData.canContainCollections = data.canContainCollections

    const result = await db
      .update(location)
      .set(updateData)
      .where(eq(location.id, id))
      .returning()

    // Update paths if parent or name changed
    if (data.parentId !== undefined || data.name !== undefined) {
      await updateLocationPath(id)
    }

    // Fetch updated location
    const updated = await db
      .select()
      .from(location)
      .where(eq(location.id, id))
      .get()

    return c.json({ location: updated })
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
    // Check if location has children
    const children = await getLocationChildren(id)
    if (children.length > 0) {
      return c.json({ error: 'Cannot delete location: it has child locations' }, 400)
    }

    // Check if location is in use by collections
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

    // Handle RunResult type - could be array or single result
    const deleteResult = Array.isArray(result) ? result : [result]
    if (deleteResult.length === 0) {
      return c.json({ error: 'Location not found' }, 404)
    }

    return c.json({ message: 'Location deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting location:', error)
    return c.json({ error: 'Failed to delete location', details: error.message }, 500)
  }
})

export default locations
