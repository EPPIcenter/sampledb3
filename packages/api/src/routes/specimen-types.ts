import { Hono } from 'hono'
import { createCrudRoutes } from '../lib/crud-routes'
import type { Database } from '../db/client'
import { 
  specimenType, 
  specimen, 
  specimenTypeContainerType,
  storageContainer,
  paper,
  cryovialTube,
  micronixTube,
  staticWell,
} from '../db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { parseId, requireParam } from '../lib/common-validators'
import { handleRouteError, NotFoundError } from '../lib/error-handler'
import { createAdminMiddleware, createAuthMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
})

import type { SpecimenType } from '../db/schema'

/**
 * Transform list response to include only specific fields
 */
function transformList(item: SpecimenType) {
  return {
    id: item.id,
    name: item.name,
    created: item.created,
    lastUpdated: item.lastUpdated,
  }
}

/**
 * Check if specimen type is in use by specimens
 */
async function checkSpecimenTypeInUse(id: number, database: any): Promise<string | null> {
  const inUse = await database
    .select()
    .from(specimen)
    .where(eq(specimen.specimenTypeId, id))
    .limit(1)
    .get()

  if (inUse) {
    return 'Cannot delete specimen type: it is in use by specimens'
  }
  return null
}

/**
 * Helper function to chunk an array into smaller arrays
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

/**
 * Check if a container type is in use by existing containers for a specimen type
 */
async function checkContainerTypeInUse(
  specimenTypeId: number,
  containerType: string,
  database: any
): Promise<{ inUse: boolean; count?: number; error?: string }> {
  try {
    // Get all storage containers for specimens of this type
    const containers = await database
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .innerJoin(specimen, eq(storageContainer.specimenId, specimen.id))
      .where(eq(specimen.specimenTypeId, specimenTypeId))
      .all()

    if (containers.length === 0) {
      return { inUse: false }
    }

    const containerIds = containers.map((c: any) => c.id)

    // SQLite has a limit on the number of variables in a query (typically 999)
    // Batch the queries to avoid exceeding this limit
    const SQLITE_MAX_VARS = 500 // Conservative limit
    const chunks = chunkArray(containerIds, SQLITE_MAX_VARS)

    // Check if any of these containers exist in the specific container type table
    let foundContainer: any = null
    
    for (const chunk of chunks) {
      if (foundContainer) break // Stop if we found one
      
      if (containerType === 'paper') {
        foundContainer = await database
          .select({ id: paper.id })
          .from(paper)
          .where(inArray(paper.id, chunk as number[]))
          .limit(1)
          .get()
      } else if (containerType === 'cryovial_tube') {
        foundContainer = await database
          .select({ id: cryovialTube.id })
          .from(cryovialTube)
          .where(inArray(cryovialTube.id, chunk as number[]))
          .limit(1)
          .get()
      } else if (containerType === 'micronix_tube') {
        foundContainer = await database
          .select({ id: micronixTube.id })
          .from(micronixTube)
          .where(inArray(micronixTube.id, chunk as number[]))
          .limit(1)
          .get()
      } else if (containerType === 'static_well') {
        foundContainer = await database
          .select({ id: staticWell.id })
          .from(staticWell)
          .where(inArray(staticWell.id, chunk as number[]))
          .limit(1)
          .get()
      }
    }

    if (foundContainer) {
      // Get specimen type name for error message
      const specType = await database
        .select()
        .from(specimenType)
        .where(eq(specimenType.id, specimenTypeId))
        .get()
      const specTypeName = specType?.name || `ID ${specimenTypeId}`
      
      // Get container type display name
      const containerTypeNames: Record<string, string> = {
        paper: 'Paper (DBS Sheet)',
        cryovial_tube: 'Cryovial Tube',
        micronix_tube: 'Micronix Tube',
        static_well: 'Static Well',
      }
      const containerTypeName = containerTypeNames[containerType] || containerType
      
      return {
        inUse: true,
        count: 1, // At least one container found
        error: `Cannot remove container type '${containerTypeName}': it is in use by existing containers for specimen type '${specTypeName}'. Please remove or reassign those containers first.`
      }
    }
  } catch (error) {
    console.error('Error checking container type usage:', error)
    return {
      inUse: false, // Fail open to avoid blocking if query fails
    }
  }

  return { inUse: false }
}

/**
 * Set created and lastUpdated timestamps on create
 */
function onCreateDefaults() {
  const now = utcNow()
  return {
    created: now,
    lastUpdated: now,
  }
}

/**
 * Update lastUpdated timestamp on update
 */
function onUpdateDefaults() {
  return {
    lastUpdated: utcNow(),
  }
}

/**
 * Create specimen types routes with database injection
 * @param database - Database instance (required)
 */
export function createSpecimenTypesRoutes(database: Database): Hono {
  const authMiddleware = createAuthMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)
  const specimenTypes = createCrudRoutes({
    table: specimenType,
    database,
    entityName: 'Specimen type',
    pluralName: 'specimenTypes',
    singularName: 'specimenType',
    createSchema,
    transformList,
    checkInUse: checkSpecimenTypeInUse,
    onCreateDefaults,
    onUpdateDefaults,
  })

  // Additional routes for container type relationships
  const containerTypeSchema = z.enum(['paper', 'cryovial_tube', 'micronix_tube', 'static_well'])

  // GET /specimen-types/:id/container-types - Get allowed container types for a specimen type
  specimenTypes.get('/:id/container-types', authMiddleware, async (c) => {
    try {
      const id = parseId(requireParam(c, 'id'))
    if (!id) {
      return c.json({ error: 'Invalid specimen type ID' }, 400)
    }

    const relationships = await database
      .select({ containerType: specimenTypeContainerType.containerType })
      .from(specimenTypeContainerType)
      .where(eq(specimenTypeContainerType.specimenTypeId, id))

    const containerTypes = relationships.map(r => r.containerType)
    
    // Check usage for each container type
    const usageInfo: Record<string, boolean> = {}
    for (const containerType of containerTypes) {
      const usageCheck = await checkContainerTypeInUse(id, containerType, database)
      usageInfo[containerType] = usageCheck.inUse
    }

    return c.json({ 
      containerTypes,
      usageInfo 
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// POST /specimen-types/:id/container-types - Add allowed container type (admin only)
specimenTypes.post('/:id/container-types', adminMiddleware, async (c) => {
  try {
    const id = parseId(requireParam(c, 'id'))
    if (!id) {
      return c.json({ error: 'Invalid specimen type ID' }, 400)
    }

    const body = await c.req.json()
    const containerType = containerTypeSchema.parse(body.containerType) as 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well'

    // Verify specimen type exists
    const specType = await database.select().from(specimenType).where(eq(specimenType.id, id)).get()
    if (!specType) {
      throw new NotFoundError('Specimen type', id)
    }

    await database.insert(specimenTypeContainerType).values({
      specimenTypeId: id,
      containerType,
    }).onConflictDoNothing()

    return c.json({ success: true, containerType })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// DELETE /specimen-types/:id/container-types/:containerType - Remove allowed container type (admin only)
specimenTypes.delete('/:id/container-types/:containerType', adminMiddleware, async (c) => {
  try {
    const id = parseId(requireParam(c, 'id'))
    const containerType = requireParam(c, 'containerType')
    
    if (!id) {
      return c.json({ error: 'Invalid specimen type ID' }, 400)
    }

    if (!containerTypeSchema.safeParse(containerType).success) {
      return c.json({ error: 'Invalid container type' }, 400)
    }

    // Check if container type is in use
    const usageCheck = await checkContainerTypeInUse(id, containerType, database)
    if (usageCheck.inUse) {
      return c.json({ 
        error: usageCheck.error || 'Container type is in use',
        inUse: true,
        count: usageCheck.count
      }, 400)
    }

    const deleted = await database
      .delete(specimenTypeContainerType)
      .where(
        and(
          eq(specimenTypeContainerType.specimenTypeId, id),
          eq(specimenTypeContainerType.containerType, containerType as any)
        )
      )
      .returning()

    if (deleted.length === 0) {
      return c.json({ error: 'Container type association not found' }, 404)
    }
    return c.json({ success: true })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  // GET /specimen-types/container-types/:containerType - Get all specimen types allowed for a container type
  specimenTypes.get('/container-types/:containerType', authMiddleware, async (c) => {
    try {
      const containerType = requireParam(c, 'containerType')
      
      if (!containerTypeSchema.safeParse(containerType).success) {
        return c.json({ error: 'Invalid container type' }, 400)
      }

      const relationships = await database
        .select({
          id: specimenType.id,
          name: specimenType.name,
          created: specimenType.created,
          lastUpdated: specimenType.lastUpdated,
        })
        .from(specimenTypeContainerType)
        .innerJoin(specimenType, eq(specimenTypeContainerType.specimenTypeId, specimenType.id))
        .where(eq(specimenTypeContainerType.containerType, containerType as any))

      return c.json({ specimenTypes: relationships })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return specimenTypes
}


