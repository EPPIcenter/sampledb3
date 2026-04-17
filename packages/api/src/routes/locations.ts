import { Hono } from 'hono'
import type { Database } from '../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
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
import { handleRouteError, NotFoundError, ValidationError } from '../lib/error-handler'
import { createAdminMiddleware, createAuthMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'

/**
 * Create locations routes with database injection
 * @param database - Database instance (required)
 * @param sqliteDatabase - Raw SQLite database instance (required for raw queries)
 */
export function createLocationsRoutes(database: Database, sqliteDatabase: SQLiteDatabase): Hono {
  const locations = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)

// List all locations
locations.get('/', authMiddleware, async (c) => {
  try {
    const search = c.req.query('search')
    // Make pagination optional: if neither page nor limit is provided, return all locations
    const hasPagination = c.req.query('page') !== undefined || c.req.query('limit') !== undefined
    const page = hasPagination ? validatePage(c.req.query('page')) : 1
    const limit = hasPagination ? await validateLimit(database, c.req.query('limit')) : undefined
    const offset = hasPagination ? (page - 1) * limit! : undefined
    
    let query = database.select().from(location)
    let countQuery = database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(location)
    
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
      ? await database.select().from(storageType).where(inArray(storageType.id, storageTypeIds.map(id => parseInt(id))))
      : []
    const storageTypeMap = new Map(storageTypes.map(st => [String(st.id), st.name]))
    
    // Enrich locations with storage type names and effective storage types
    const enrichedLocations = await Promise.all(
      locationsList.map(async (loc) => {
        // Get effective storage type (from root)
        const effectiveStorageTypeId = await getLocationStorageTypeId(database, loc.id)
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
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get location by ID
locations.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid location ID' }, 400)
  }

  const locationRecord = await database
    .select()
    .from(location)
    .where(eq(location.id, id))
    .get()

    if (!locationRecord) {
      throw new NotFoundError('Location', id)
    }

  // Get children, ancestors, path, and effective storage type
  const [children, ancestors, computedPath, effectiveStorageTypeId] = await Promise.all([
    getLocationChildren(database, id),
    getLocationAncestors(sqliteDatabase, id),
    buildLocationPath(sqliteDatabase, id),
    getLocationStorageTypeId(database, id),
  ])

  // Get storage type name if we have a storage type ID
  let storageTypeName: string | null = null
  if (effectiveStorageTypeId) {
    const st = await database
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
  const platesLimit = await validateLimit(database, c.req.query('plates_limit') || String(defaultLimit))
  const platesOffset = (platesPage - 1) * platesLimit

  const cryovialBoxesPage = validatePage(c.req.query('cryovial_boxes_page') || '1')
  const cryovialBoxesLimit = await validateLimit(database, c.req.query('cryovial_boxes_limit') || String(defaultLimit))
  const cryovialBoxesOffset = (cryovialBoxesPage - 1) * cryovialBoxesLimit

  const boxesPage = validatePage(c.req.query('boxes_page') || '1')
  const boxesLimit = await validateLimit(database, c.req.query('boxes_limit') || String(defaultLimit))
  const boxesOffset = (boxesPage - 1) * boxesLimit

  const bagsPage = validatePage(c.req.query('bags_page') || '1')
  const bagsLimit = await validateLimit(database, c.req.query('bags_limit') || String(defaultLimit))
  const bagsOffset = (bagsPage - 1) * bagsLimit

  // Get total counts for pagination
  const [platesCountResult, cryovialBoxesCountResult, boxesCountResult, bagsCountResult] = await Promise.all([
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(micronixPlate).where(eq(micronixPlate.locationId, id)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(cryovialBox).where(eq(cryovialBox.locationId, id)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(box).where(eq(box.locationId, id)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(bag).where(eq(bag.locationId, id)),
  ])

  const platesTotal = platesCountResult[0]?.count || 0
  const cryovialBoxesTotal = cryovialBoxesCountResult[0]?.count || 0
  const boxesTotal = boxesCountResult[0]?.count || 0
  const bagsTotal = bagsCountResult[0]?.count || 0

  // Fetch paginated results
  const plates = await database
    .select()
    .from(micronixPlate)
    .where(eq(micronixPlate.locationId, id))
    .limit(platesLimit)
    .offset(platesOffset)

  const cryovialBoxes = await database
    .select()
    .from(cryovialBox)
    .where(eq(cryovialBox.locationId, id))
    .limit(cryovialBoxesLimit)
    .offset(cryovialBoxesOffset)

  const regularBoxes = await database
    .select()
    .from(box)
    .where(eq(box.locationId, id))
    .orderBy(desc(box.id))
    .limit(boxesLimit)
    .offset(boxesOffset)

  const bags = await database
    .select()
    .from(bag)
    .where(eq(bag.locationId, id))
    .limit(bagsLimit)
    .offset(bagsOffset)

  // Get hierarchy statistics
  const hierarchyStats = await getLocationHierarchyStats(database, sqliteDatabase, id)

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

// Create new location (admin only)
locations.post('/', adminMiddleware, async (c) => {
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
    const validationError = await validateLocationHierarchy(database, sqliteDatabase, data.parentId ?? null)
    if (validationError) {
      throw new ValidationError(validationError)
    }

    // Check for duplicate name under same parent
    const existing = await database
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
      throw new ValidationError('Location with this name already exists under the same parent')
    }

    const now = utcNow()
    const user = c.get('user')
    const result = await database
      .insert(location)
      .values({
        parentId: data.parentId ?? null,
        name: data.name,
        storageTypeId: data.parentId === null ? data.storageTypeId : null, // Only set for root locations
        description: data.description,
        canContainCollections: data.canContainCollections,
        created: now,
        lastUpdated: now,
        createdBy: user?.id,
        updatedBy: user?.id,
      })
      .returning()

    // Handle RunResult type - could be array or single result
    const insertResult = Array.isArray(result) ? result : [result]
    if (insertResult.length === 0) {
      return c.json({ error: 'Failed to create location' }, 500)
    }

    // Update path for this location and descendants
    await updateLocationPath(database, sqliteDatabase, insertResult[0].id)

    // Fetch the created location with updated path
    const created = await database
      .select()
      .from(location)
      .where(eq(location.id, insertResult[0].id))
      .get()

    return c.json({ location: created }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Update location
locations.put('/:id', adminMiddleware, async (c) => {
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
    const existing = await database
      .select()
      .from(location)
      .where(eq(location.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Location not found' }, 404)
    }

    // Validate parent if being changed
    if (data.parentId !== undefined) {
      const validationError = await validateLocationHierarchy(database, sqliteDatabase, data.parentId ?? null, id)
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
      
      const duplicate = await database
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
      lastUpdated: utcNow(),
    }
    if (data.parentId !== undefined) updateData.parentId = data.parentId ?? null
    if (data.name !== undefined) updateData.name = data.name
    // Only set storageTypeId for root locations
    if (data.storageTypeId !== undefined) {
      updateData.storageTypeId = isRoot ? data.storageTypeId : null
    }
    if (data.description !== undefined) updateData.description = data.description ?? null
    if (data.canContainCollections !== undefined) updateData.canContainCollections = data.canContainCollections

    const user = c.get('user')
    if (user) {
      updateData.updatedBy = user.id
    }

    const result = await database
      .update(location)
      .set(updateData)
      .where(eq(location.id, id))
      .returning()

    // Update paths if parent or name changed
    if (data.parentId !== undefined || data.name !== undefined) {
      await updateLocationPath(database, sqliteDatabase, id)
    }

    // Fetch updated location
    const updated = await database
      .select()
      .from(location)
      .where(eq(location.id, id))
      .get()

    return c.json({ location: updated })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Delete location
locations.delete('/:id', adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid location ID' }, 400)
  }

  try {
    // Check if location has children
    const children = await getLocationChildren(database, id)
    if (children.length > 0) {
      return c.json({ error: 'Cannot delete location: it has child locations' }, 400)
    }

    // Check if location is in use by collections
    const [hasPlates, hasCryovialBoxes, hasBoxes, hasBags] = await Promise.all([
      database.select().from(micronixPlate).where(eq(micronixPlate.locationId, id)).limit(1).get(),
      database.select().from(cryovialBox).where(eq(cryovialBox.locationId, id)).limit(1).get(),
      database.select().from(box).where(eq(box.locationId, id)).limit(1).get(),
      database.select().from(bag).where(eq(bag.locationId, id)).limit(1).get(),
    ])

    if (hasPlates || hasCryovialBoxes || hasBoxes || hasBags) {
      return c.json({ error: 'Cannot delete location: it is in use by storage containers' }, 400)
    }

    const result = await database
      .delete(location)
      .where(eq(location.id, id))
      .returning()

    // Handle RunResult type - could be array or single result
    const deleteResult = Array.isArray(result) ? result : [result]
    if (deleteResult.length === 0) {
      return c.json({ error: 'Location not found' }, 404)
    }

    return c.json({ message: 'Location deleted successfully' })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return locations
}

// Default export removed - routes must be created with database injection via createLocationsRoutes()
// This will be handled in index.ts
