import type { Database } from '../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { location, micronixPlate, cryovialBox, box, bag } from '../db/schema'
import { eq, sql, and, isNull, isNotNull, inArray } from 'drizzle-orm'

/**
 * Build full path string for a location by walking up the parent chain
 */
export async function buildLocationPath(sqliteDatabase: SQLiteDatabase, locationId: number): Promise<string | null> {
  const stmt = sqliteDatabase.prepare(`
    WITH RECURSIVE location_paths AS (
      -- Base case: start with the location
      SELECT id, parent_id, name, name as path, 0 as depth
      FROM location
      WHERE id = ?
      
      UNION ALL
      
      -- Recursive case: walk up to parent
      -- Build path as parent → child (root → leaf) instead of child → parent
      SELECT l.id, l.parent_id, l.name, l.name || ' → ' || lp.path, lp.depth + 1
      FROM location l
      JOIN location_paths lp ON l.id = lp.parent_id
      WHERE lp.depth < 20  -- Prevent infinite loops
    )
    SELECT path FROM location_paths WHERE parent_id IS NULL
  `)
  
  const result = stmt.get(locationId) as { path: string } | undefined
  return result?.path || null
}

/**
 * Get all ancestors of a location (parent, grandparent, etc.)
 */
export async function getLocationAncestors(sqliteDatabase: SQLiteDatabase, locationId: number): Promise<typeof location.$inferSelect[]> {
  const stmt = sqliteDatabase.prepare(`
    WITH RECURSIVE location_ancestors AS (
      -- Base case: get the location's parent
      SELECT id, parent_id, name, storage_type_id, description, 
             can_contain_collections, path, created, last_updated
      FROM location
      WHERE id = (
        SELECT parent_id FROM location WHERE id = ?
      )
      
      UNION ALL
      
      -- Recursive case: get parent's parent
      SELECT l.id, l.parent_id, l.name, l.storage_type_id, l.description,
             l.can_contain_collections, l.path, l.created, l.last_updated
      FROM location l
      JOIN location_ancestors la ON l.id = la.parent_id
    )
    SELECT * FROM location_ancestors
  `)
  
  const rows = stmt.all(locationId) as typeof location.$inferSelect[]
  return rows
}

/**
 * Get all descendants of a location (children, grandchildren, etc.)
 */
export async function getLocationDescendants(sqliteDatabase: SQLiteDatabase, locationId: number): Promise<typeof location.$inferSelect[]> {
  const stmt = sqliteDatabase.prepare(`
    WITH RECURSIVE location_descendants AS (
      -- Base case: get direct children
      SELECT id, parent_id, name, storage_type_id, description,
             can_contain_collections, path, created, last_updated
      FROM location
      WHERE parent_id = ?
      
      UNION ALL
      
      -- Recursive case: get children of children
      SELECT l.id, l.parent_id, l.name, l.storage_type_id, l.description,
             l.can_contain_collections, l.path, l.created, l.last_updated
      FROM location l
      JOIN location_descendants ld ON l.parent_id = ld.id
    )
    SELECT * FROM location_descendants
  `)
  
  const rows = stmt.all(locationId) as typeof location.$inferSelect[]
  return rows
}

/**
 * Validate that setting parent_id won't create a circular reference
 * Returns null if valid, error message if invalid
 */
export async function validateLocationHierarchy(
  database: Database,
  sqliteDatabase: SQLiteDatabase,
  parentId: number | null,
  locationId?: number
): Promise<string | null> {
  // If no parent, no circular reference possible
  if (parentId === null) {
    return null
  }
  
  // If setting parent to self, that's a circular reference
  if (locationId && parentId === locationId) {
    return 'Location cannot be its own parent'
  }
  
  // Check if the parent is a descendant of this location (would create cycle)
  if (locationId) {
    const descendants = await getLocationDescendants(sqliteDatabase, locationId)
    if (descendants.some(d => d.id === parentId)) {
      return 'Cannot set parent: would create a circular reference (parent is a descendant)'
    }
  }
  
  // Verify parent exists
  const parent = await database
    .select()
    .from(location)
    .where(eq(location.id, parentId))
    .get()
  
  if (!parent) {
    return 'Parent location not found'
  }
  
  return null
}

/**
 * Get only locations where can_contain_collections = true
 */
export async function getLocationsForCollections(database: Database): Promise<typeof location.$inferSelect[]> {
  return await database
    .select()
    .from(location)
    .where(eq(location.canContainCollections, true))
}

/**
 * Build tree structure from flat list of locations
 */
export function buildLocationTree(locations: typeof location.$inferSelect[]): Map<number | null, typeof location.$inferSelect[]> {
  const tree = new Map<number | null, typeof location.$inferSelect[]>()
  
  // Group by parent_id
  for (const loc of locations) {
    const parentId = loc.parentId ?? null
    if (!tree.has(parentId)) {
      tree.set(parentId, [])
    }
    tree.get(parentId)!.push(loc)
  }
  
  return tree
}

/**
 * Get direct children of a location
 */
export async function getLocationChildren(database: Database, locationId: number): Promise<typeof location.$inferSelect[]> {
  return await database
    .select()
    .from(location)
    .where(eq(location.parentId, locationId))
}

/**
 * Update materialized path for a location and all its descendants
 */
export async function updateLocationPath(database: Database, sqliteDatabase: SQLiteDatabase, locationId: number): Promise<void> {
  // Build path for this location
  const path = await buildLocationPath(sqliteDatabase, locationId)
  
  // Update this location's path
  await database
    .update(location)
    .set({ path: path || null })
    .where(eq(location.id, locationId))
  
  // Update all descendants' paths
  const descendants = await getLocationDescendants(sqliteDatabase, locationId)
  for (const desc of descendants) {
    const descPath = await buildLocationPath(sqliteDatabase, desc.id)
    await database
      .update(location)
      .set({ path: descPath || null })
      .where(eq(location.id, desc.id))
  }
}

/**
 * Get the storage type ID for a location by walking up to the root
 * Only root locations have storage_type_id, so we need to find the root
 */
export async function getLocationStorageTypeId(database: Database, locationId: number): Promise<string | null> {
  const loc = await database
    .select()
    .from(location)
    .where(eq(location.id, locationId))
    .get()
  
  if (!loc) {
    return null
  }
  
  // If this location has a storage_type_id, return it (it's a root)
  if (loc.storageTypeId) {
    return loc.storageTypeId
  }
  
  // Otherwise, walk up to find the root
  // Use iterative approach to walk up the parent chain
  let currentId: number | null = loc.parentId
  
  while (currentId) {
    const parent = await database
      .select()
      .from(location)
      .where(eq(location.id, currentId))
      .get()
    
    if (!parent) break
    
    // If this parent has a storage_type_id, it's the root
    if (parent.storageTypeId) {
      return parent.storageTypeId
    }
    
    // Continue walking up
    currentId = parent.parentId
  }
  
  return null
}

/**
 * Calculate hierarchy statistics for a location
 * Returns aggregated statistics including depth, descendant counts, and container counts
 */
export async function getLocationHierarchyStats(database: Database, sqliteDatabase: SQLiteDatabase, locationId: number): Promise<{
  depth: number
  totalDescendants: number
  directContainers: {
    micronix: number
    cryovial: number
    boxes: number
    bags: number
  }
  aggregatedContainers: {
    micronix: number
    cryovial: number
    boxes: number
    bags: number
  }
  childLocationStats: Array<{
    locationId: number
    locationName: string
    canContainCollections: boolean
    containerCounts: {
      micronix: number
      cryovial: number
      boxes: number
      bags: number
    }
  }>
}> {
  // Get all descendants
  const descendants = await getLocationDescendants(sqliteDatabase, locationId)
  const allLocationIds = [locationId, ...descendants.map(d => d.id)]
  
  // Calculate depth by walking up to root
  const ancestors = await getLocationAncestors(sqliteDatabase, locationId)
  const depth = ancestors.length
  
  // Get direct container counts (this location only)
  const [directPlatesCount, directCryovialCount, directBoxesCount, directBagsCount] = await Promise.all([
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(micronixPlate).where(eq(micronixPlate.locationId, locationId)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(cryovialBox).where(eq(cryovialBox.locationId, locationId)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(box).where(eq(box.locationId, locationId)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(bag).where(eq(bag.locationId, locationId)),
  ])
  
  const directContainers = {
    micronix: directPlatesCount[0]?.count || 0,
    cryovial: directCryovialCount[0]?.count || 0,
    boxes: directBoxesCount[0]?.count || 0,
    bags: directBagsCount[0]?.count || 0,
  }
  
  // Get aggregated container counts (this location + all descendants)
  const [aggregatedPlatesCount, aggregatedCryovialCount, aggregatedBoxesCount, aggregatedBagsCount] = await Promise.all([
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(micronixPlate).where(inArray(micronixPlate.locationId, allLocationIds)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(cryovialBox).where(inArray(cryovialBox.locationId, allLocationIds)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(box).where(inArray(box.locationId, allLocationIds)),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(bag).where(inArray(bag.locationId, allLocationIds)),
  ])
  
  const aggregatedContainers = {
    micronix: aggregatedPlatesCount[0]?.count || 0,
    cryovial: aggregatedCryovialCount[0]?.count || 0,
    boxes: aggregatedBoxesCount[0]?.count || 0,
    bags: aggregatedBagsCount[0]?.count || 0,
  }
  
  // Get per-child-location statistics
  const children = await getLocationChildren(database, locationId)
  const childLocationStats = await Promise.all(
    children.map(async (child) => {
      const childDescendants = await getLocationDescendants(sqliteDatabase, child.id)
      const childLocationIds = [child.id, ...childDescendants.map(d => d.id)]
      
      const [childPlatesCount, childCryovialCount, childBoxesCount, childBagsCount] = await Promise.all([
        database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(micronixPlate).where(inArray(micronixPlate.locationId, childLocationIds)),
        database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(cryovialBox).where(inArray(cryovialBox.locationId, childLocationIds)),
        database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(box).where(inArray(box.locationId, childLocationIds)),
        database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(bag).where(inArray(bag.locationId, childLocationIds)),
      ])
      
      return {
        locationId: child.id,
        locationName: child.name,
        canContainCollections: child.canContainCollections,
        containerCounts: {
          micronix: childPlatesCount[0]?.count || 0,
          cryovial: childCryovialCount[0]?.count || 0,
          boxes: childBoxesCount[0]?.count || 0,
          bags: childBagsCount[0]?.count || 0,
        },
      }
    })
  )
  
  return {
    depth,
    totalDescendants: descendants.length,
    directContainers,
    aggregatedContainers,
    childLocationStats,
  }
}

