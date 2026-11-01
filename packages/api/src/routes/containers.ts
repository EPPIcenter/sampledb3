import { Hono } from 'hono'
import type { Database } from '../db/client'
import { storageContainer, micronixTube, cryovialTube, paper, staticWell, tag, storageContainerTag } from '../db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { validatePage, validateLimit } from '../lib/constants'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'
import { requireParam } from '../lib/common-validators'
import { findContainersByBarcode, findTubesUsingBarcode } from '../lib/identifier-resolution'
import { enrichContainerForApi, enrichContainersForApi, toEnrichedContainerApi } from '../lib/container-api-enrichment'
import { loadContainerReadViews } from '../lib/container-read-view'
import { mapEnrichedContainerToWire, mapEnrichedContainersToWire } from '../lib/container-wire-mapper'
import {
  handleRouteError,
  RouteError,
  containersFetchFailedBody,
  NotFoundError,
  ValidationError,
} from '../lib/error-handler'
import { withWriteTransaction } from '../db/write-transaction'
import { validateUnitForContainerType } from '../lib/validation'
import { containerHasAllTags } from '../lib/container-selection'

/**
 * Create containers routes with database injection
 * @param database - Database instance (required)
 */
export function createContainersRoutes(database: Database): Hono {
  const containers = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

// List containers with filters
containers.get('/', authMiddleware, async (c) => {
  try {
    const specimenId = c.req.query('specimen_id')
    const locationId = c.req.query('location_id')
    const tagIds = c.req.queries('tag_ids')?.map(id => parseInt(id)).filter(id => !isNaN(id))
    const page = validatePage(c.req.query('page'))
    const limit = await validateLimit(database, c.req.query('limit'))
    const offset = (page - 1) * limit
    
    let query = database.select().from(storageContainer)
    let countQuery = database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(storageContainer)
    
    const conditions = []
    
    if (specimenId) {
      const id = parseInt(specimenId)
      if (!isNaN(id)) {
        conditions.push(eq(storageContainer.specimenId, id))
      }
    }
    
    const tags = containerHasAllTags(tagIds ?? [])
    if (tags) conditions.push(tags)

    if (conditions.length > 0) {
      const whereClause = and(...conditions) as any
      query = query.where(whereClause) as any
      countQuery = countQuery.where(whereClause) as any
    }
    
    const [containersList, countResult] = await Promise.all([
      query.limit(limit).offset(offset),
      countQuery,
    ])
    
    const total = countResult[0]?.count || 0
    
    // Enrich containers with location and tags info
    const enrichedContainers = await enrichContainersForApi(database, containersList)
    
    return c.json({
      containers: mapEnrichedContainersToWire(enrichedContainers),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: unknown) {
    return handleRouteError(
      new RouteError(500, containersFetchFailedBody('Failed to fetch containers', error)),
      c,
    )
  }
})

// Get container by ID with full details
containers.get('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    // Get base container
    const container = await database
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.id, id))
      .get()

    if (!container) {
      return c.json({ error: 'Container not found' }, 404)
    }

    const view = (await loadContainerReadViews(database, [container])).at(0)
    if (!view) {
      return c.json({ error: 'Container not found' }, 404)
    }

    return c.json({
      container: mapEnrichedContainerToWire(toEnrichedContainerApi(view)),
      specimen: view.specimen,
      source: view.source,
    })
  } catch (error: unknown) {
    return handleRouteError(
      new RouteError(500, containersFetchFailedBody('Failed to fetch container', error)),
      c,
    )
  }
})

// Update container. Every change is saved, or none: the checks and writes share one transaction.
const containerPatchSchema = z.object({
  comment: z.string().optional(),
  remainingQuantity: z.number().optional(),
  unitId: z.number().int().optional(),
  tagIds: z.array(z.number().int()).optional(), // Replaces the Container's Tags
  barcode: z.union([z.string(), z.null()]).optional(),
  sublabel: z.union([z.string(), z.null()]).optional(),
})

type ContainerSubtype = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

async function containerSubtypeOf(database: Database, id: number): Promise<ContainerSubtype | null> {
  const [micronixInfo, cryovialInfo, paperInfo, staticWellInfo] = await Promise.all([
    database.select({ id: micronixTube.id }).from(micronixTube).where(eq(micronixTube.id, id)).get(),
    database.select({ id: cryovialTube.id }).from(cryovialTube).where(eq(cryovialTube.id, id)).get(),
    database.select({ id: paper.id }).from(paper).where(eq(paper.id, id)).get(),
    database.select({ id: staticWell.id }).from(staticWell).where(eq(staticWell.id, id)).get(),
  ])
  if (micronixInfo) return 'micronix_tube'
  if (cryovialInfo) return 'cryovial_tube'
  if (paperInfo) return 'paper'
  if (staticWellInfo) return 'static_well'
  return null
}

/** The barcode to store (null clears it). Throws when this subtype can't take one. */
function nextBarcode(containerType: ContainerSubtype | null, rawBarcode: string | null): string | null {
  if (containerType === 'paper') {
    throw new ValidationError('Paper containers use sublabel for spot identifiers, not barcode')
  }
  if (containerType === 'static_well' || !containerType) {
    throw new ValidationError('Barcode cannot be set for this container type')
  }
  const trimmed = rawBarcode?.trim() ?? ''
  if (containerType === 'micronix_tube') {
    if (rawBarcode === null) throw new ValidationError('Micronix tube barcode cannot be cleared')
    if (trimmed.length === 0) throw new ValidationError('Micronix tube barcode cannot be empty')
  }
  return trimmed.length === 0 ? null : trimmed
}

function nextSublabel(containerType: ContainerSubtype | null, rawSublabel: string | null): string | null {
  if (containerType !== 'paper') {
    throw new ValidationError('Sublabel can only be set for paper containers')
  }
  const trimmed = rawSublabel?.trim() ?? ''
  return trimmed.length === 0 ? null : trimmed
}

/** The tube barcode or Paper sublabel the Container has now. */
async function currentIdentifier(database: Database, id: number, containerType: ContainerSubtype | null): Promise<string | null> {
  switch (containerType) {
    case 'micronix_tube':
      return (await database.select({ value: micronixTube.barcode }).from(micronixTube).where(eq(micronixTube.id, id)).get())?.value ?? null
    case 'cryovial_tube':
      return (await database.select({ value: cryovialTube.barcode }).from(cryovialTube).where(eq(cryovialTube.id, id)).get())?.value ?? null
    case 'paper':
      return (await database.select({ value: paper.sublabel }).from(paper).where(eq(paper.id, id)).get())?.value ?? null
    default:
      return null
  }
}

/**
 * Rejects a barcode or sublabel another Container already has. A tube barcode is compared
 * with every tube's barcode ignoring case and surrounding whitespace. An unchanged value is
 * not checked, so a Container whose barcode was duplicated before this check existed still saves.
 */
async function assertIdentifierFree(
  database: Database,
  id: number,
  containerType: ContainerSubtype | null,
  identifier: string | null,
  label: 'Barcode' | 'Sublabel',
): Promise<void> {
  if (identifier === null) return
  if (identifier === (await currentIdentifier(database, id, containerType))?.trim()) return
  const takenBy =
    label === 'Barcode'
      ? await findTubesUsingBarcode(database, identifier, id)
      : (await findContainersByBarcode(database, identifier)).filter((match) => match.containerId !== id)
  if (takenBy.length === 0) return
  // Name the stored spelling when only a case or whitespace variant collides.
  const asVariant = takenBy.some((match) => match.barcode === identifier) ? '' : ` as '${takenBy[0].barcode}'`
  throw new ValidationError(`${label} '${identifier}' is already in use${asVariant}`, {
    containerIds: takenBy.map((match) => match.containerId),
  })
}

/** De-duplicated Tag ids, after checking that each one exists. */
async function knownTagIds(database: Database, tagIds: number[]): Promise<number[]> {
  const unique = [...new Set(tagIds)]
  if (unique.length === 0) return unique
  const found = await database.select({ id: tag.id }).from(tag).where(inArray(tag.id, unique))
  const foundIds = new Set(found.map((row) => row.id))
  const unknown = unique.filter((tagId) => !foundIds.has(tagId))
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown tag id${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`, {
      unknownTagIds: unknown,
    })
  }
  return unique
}

containers.patch('/:id', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      throw new ValidationError('Invalid container ID')
    }

    const data = containerPatchSchema.parse(await c.req.json())
    const { tagIds, unitId, barcode: rawBarcode, sublabel: rawSublabel, comment, remainingQuantity } = data
    const userId = c.get('user')?.id

    const updated = await withWriteTransaction(database, async (tx) => {
      const container = await tx.select({ id: storageContainer.id }).from(storageContainer).where(eq(storageContainer.id, id)).get()
      if (!container) {
        throw new NotFoundError('Container', id)
      }
      const containerType = await containerSubtypeOf(tx, id)

      // Check everything before the first write.
      if (unitId !== undefined && containerType) {
        const validation = await validateUnitForContainerType(tx, containerType, unitId)
        if (!validation.valid) {
          throw new ValidationError(validation.error ?? 'Invalid unit for this container type')
        }
      }
      const newBarcode = rawBarcode === undefined ? undefined : nextBarcode(containerType, rawBarcode)
      if (newBarcode !== undefined) await assertIdentifierFree(tx, id, containerType, newBarcode, 'Barcode')
      const newSublabel = rawSublabel === undefined ? undefined : nextSublabel(containerType, rawSublabel)
      if (newSublabel !== undefined) await assertIdentifierFree(tx, id, containerType, newSublabel, 'Sublabel')
      const newTagIds = tagIds === undefined ? undefined : await knownTagIds(tx, tagIds)

      const [row] = await tx
        .update(storageContainer)
        .set({
          ...(comment !== undefined && { comment: comment.trim() === '' ? null : comment }),
          ...(remainingQuantity !== undefined && { remainingQuantity }),
          ...(unitId !== undefined && { unitId }),
          lastUpdated: utcNow(),
          updatedBy: userId,
        })
        .where(eq(storageContainer.id, id))
        .returning()

      if (newTagIds !== undefined) {
        await tx.delete(storageContainerTag).where(eq(storageContainerTag.storageContainerId, id))
        if (newTagIds.length > 0) {
          await tx.insert(storageContainerTag).values(newTagIds.map((tagId) => ({ storageContainerId: id, tagId })))
        }
      }

      if (newBarcode !== undefined) {
        if (containerType === 'micronix_tube' && newBarcode !== null) {
          await tx.update(micronixTube).set({ barcode: newBarcode }).where(eq(micronixTube.id, id))
        } else if (containerType === 'cryovial_tube') {
          await tx.update(cryovialTube).set({ barcode: newBarcode }).where(eq(cryovialTube.id, id))
        }
      }
      if (newSublabel !== undefined) {
        await tx.update(paper).set({ sublabel: newSublabel }).where(eq(paper.id, id))
      }

      return row
    })

    const enriched = await enrichContainerForApi(database, updated)
    return c.json({ container: mapEnrichedContainerToWire(enriched) })
  } catch (error: unknown) {
    return handleRouteError(error, c)
  }
})

// Get container tags
containers.get('/:id/tags', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const tags = await database
      .select({ id: tag.id, name: tag.name })
      .from(tag)
      .innerJoin(storageContainerTag, eq(tag.id, storageContainerTag.tagId))
      .where(eq(storageContainerTag.storageContainerId, id))

    return c.json({ tags })
  } catch (error: unknown) {
    return handleRouteError(
      new RouteError(500, containersFetchFailedBody('Failed to fetch container tags', error)),
      c,
    )
  }
})

// Add tag to container
containers.post('/:id/tags', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      tagId: z.number().int(),
    })
    
    const { tagId } = schema.parse(body)

    // Check if container exists
    const container = await database.select().from(storageContainer).where(eq(storageContainer.id, id)).get()
    if (!container) {
      return c.json({ error: 'Container not found' }, 404)
    }

    // Check if tag exists
    const tagRecord = await database.select().from(tag).where(eq(tag.id, tagId)).get()
    if (!tagRecord) {
      return c.json({ error: 'Tag not found' }, 404)
    }

    // Add tag (ignore if already exists due to primary key constraint)
    try {
      await database.insert(storageContainerTag).values({
        storageContainerId: id,
        tagId,
      })
    } catch (error: unknown) {
      // Ignore duplicate key errors
      if (error instanceof Error && !error.message.includes('UNIQUE constraint')) {
        throw error
      }
    }

    return c.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Remove tag from container
containers.delete('/:id/tags/:tagId', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    const tagId = parseInt(requireParam(c, 'tagId'))
    
    if (isNaN(id) || isNaN(tagId)) {
      return c.json({ error: 'Invalid container ID or tag ID' }, 400)
    }

    const deleted = await database.delete(storageContainerTag)
      .where(
        and(
          eq(storageContainerTag.storageContainerId, id),
          eq(storageContainerTag.tagId, tagId)
        )
      )
      .returning()

    if (deleted.length === 0) {
      return c.json({ error: 'Tag association not found' }, 404)
    }
    return c.json({ success: true })
  } catch (error: unknown) {
    return handleRouteError(
      new RouteError(500, containersFetchFailedBody('Failed to remove tag', error)),
      c,
    )
  }
})

  return containers
}
