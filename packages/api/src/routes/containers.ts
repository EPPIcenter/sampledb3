import { Hono } from 'hono'
import type { Database } from '../db/client'
import { storageContainer, specimen, unit, micronixTube, cryovialTube, paper, staticWell, specimenType, tag, storageContainerTag } from '../db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { validatePage, validateLimit } from '../lib/constants'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'
import { requireParam } from '../lib/common-validators'
import { resolveContainerByBarcode } from '../lib/identifier-resolution'
import { resolveSpecimenSource } from '../lib/specimens/provenance'
import { enrichContainerForApi, enrichContainersForApi } from '../lib/container-api-enrichment'
import { mapEnrichedContainerToWire, mapEnrichedContainersToWire } from '../lib/container-wire-mapper'
import type { SpecimenSummaryWire } from '@sampledb/contract/wire'
import { handleRouteError, RouteError, containersFetchFailedBody } from '../lib/error-handler'

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
    
    // Filter by tags if provided
    if (tagIds && tagIds.length > 0) {
      const containerIdsWithTags = await database
        .select({ containerId: storageContainerTag.storageContainerId })
        .from(storageContainerTag)
        .where(inArray(storageContainerTag.tagId, tagIds))
      
      const ids = [...new Set(containerIdsWithTags.map(r => r.containerId))]
      if (ids.length > 0) {
        conditions.push(inArray(storageContainer.id, ids))
      } else {
        // No containers match the tags, return empty result
        return c.json({
          containers: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        })
      }
    }
    
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

    const enriched = await enrichContainerForApi(database, container)

    // Get specimen details with type (projected to the wire summary, ADR 0005)
    const spec: SpecimenSummaryWire | null =
      (await database
        .select({
          id: specimen.id,
          studySubjectId: specimen.studySubjectId,
          controlBatchId: specimen.controlBatchId,
          specimenTypeId: specimen.specimenTypeId,
          collectionDate: specimen.collectionDate,
          created: specimen.created,
          lastUpdated: specimen.lastUpdated,
          specimenType: {
            id: specimenType.id,
            name: specimenType.name,
          },
        })
        .from(specimen)
        .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
        .where(eq(specimen.id, container.specimenId))
        .get()) ?? null

    const sourceInfo = spec ? await resolveSpecimenSource(database, container.specimenId) : null

    return c.json({
      container: mapEnrichedContainerToWire(enriched),
      specimen: spec,
      source: sourceInfo,
    })
  } catch (error: unknown) {
    return handleRouteError(
      new RouteError(500, containersFetchFailedBody('Failed to fetch container', error)),
      c,
    )
  }
})

// Update container
containers.patch('/:id', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      comment: z.string().optional(),
      remainingQuantity: z.number().optional(),
      unitId: z.number().int().optional(),
      tagIds: z.array(z.number().int()).optional(), // Replace tags
      barcode: z.union([z.string(), z.null()]).optional(),
      sublabel: z.union([z.string(), z.null()]).optional(),
    })
    
    const data = schema.parse(body)
    const { tagIds, unitId, barcode: rawBarcode, sublabel: rawSublabel, ...restData } = data
    const updateData: { comment?: string; remainingQuantity?: number; unitId?: number } = { ...restData }

    const [container, micronixInfo, cryovialInfo, paperInfo, staticWellInfo] = await Promise.all([
      database.select().from(storageContainer).where(eq(storageContainer.id, id)).get(),
      database.select().from(micronixTube).where(eq(micronixTube.id, id)).get(),
      database.select().from(cryovialTube).where(eq(cryovialTube.id, id)).get(),
      database.select().from(paper).where(eq(paper.id, id)).get(),
      database.select().from(staticWell).where(eq(staticWell.id, id)).get(),
    ])

    if (!container) {
      return c.json({ error: 'Container not found' }, 404)
    }

    let containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' | null = null
    if (micronixInfo) containerType = 'micronix_tube'
    else if (cryovialInfo) containerType = 'cryovial_tube'
    else if (paperInfo) containerType = 'paper'
    else if (staticWellInfo) containerType = 'static_well'

    // Validate unit if provided
    if (unitId !== undefined) {
      if (containerType) {
        // Validate unit is allowed for container type
        const { validateUnitForContainerType } = await import('../lib/validation')
        const validation = await validateUnitForContainerType(database, containerType, unitId)
        if (!validation.valid) {
          return c.json({ error: validation.error }, 400)
        }
      }

      updateData.unitId = unitId
    }

    let newBarcode: string | null | undefined
    let newSublabel: string | null | undefined
    if (rawBarcode !== undefined) {
      if (containerType === 'paper') {
        return c.json({ error: 'Paper containers use sublabel for spot identifiers, not barcode' }, 400)
      }
      if (containerType === 'static_well' || !containerType) {
        return c.json({ error: 'Barcode cannot be set for this container type' }, 400)
      }

      if (containerType === 'micronix_tube') {
        if (rawBarcode === null) {
          return c.json({ error: 'Micronix tube barcode cannot be cleared' }, 400)
        }
        const trimmed = rawBarcode.trim()
        if (trimmed.length === 0) {
          return c.json({ error: 'Micronix tube barcode cannot be empty' }, 400)
        }
        newBarcode = trimmed
      } else {
        if (rawBarcode === null) {
          newBarcode = null
        } else {
          const trimmed = rawBarcode.trim()
          newBarcode = trimmed.length === 0 ? null : trimmed
        }
      }

      if (newBarcode !== null && newBarcode !== undefined) {
        const takenBy = await resolveContainerByBarcode(database, newBarcode)
        if (takenBy !== null && takenBy !== id) {
          return c.json({ error: `Barcode '${newBarcode}' is already in use` }, 400)
        }
      }
    }

    if (rawSublabel !== undefined) {
      if (containerType !== 'paper') {
        return c.json({ error: 'Sublabel can only be set for paper containers' }, 400)
      }
      if (rawSublabel === null) {
        newSublabel = null
      } else {
        const trimmed = rawSublabel.trim()
        newSublabel = trimmed.length === 0 ? null : trimmed
      }
      if (newSublabel !== null && newSublabel !== undefined) {
        const takenBy = await resolveContainerByBarcode(database, newSublabel)
        if (takenBy !== null && takenBy !== id) {
          return c.json({ error: `Sublabel '${newSublabel}' is already in use` }, 400)
        }
      }
    }

    // Update container fields (excluding tagIds and barcode on subtype)
    const user = c.get('user')
    const [updated] = await database
      .update(storageContainer)
      .set({
        ...updateData,
        lastUpdated: utcNow(),
        updatedBy: user?.id,
      })
      .where(eq(storageContainer.id, id))
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: update must return row
    if (!updated) {
      return c.json({ error: 'Container not found' }, 404)
    }
    
    // Update tags if provided
    if (tagIds !== undefined) {
      // Remove all existing tags
      await database.delete(storageContainerTag)
        .where(eq(storageContainerTag.storageContainerId, id))
      
      // Add new tags
      if (tagIds.length > 0) {
        await database.insert(storageContainerTag).values(
          tagIds.map(tagId => ({
            storageContainerId: id,
            tagId,
          }))
        )
      }
    }

    if (rawBarcode !== undefined) {
      if (containerType === 'micronix_tube' && newBarcode != null) {
        await database.update(micronixTube).set({ barcode: newBarcode }).where(eq(micronixTube.id, id))
      } else if (containerType === 'cryovial_tube' && newBarcode !== undefined) {
        await database.update(cryovialTube).set({ barcode: newBarcode }).where(eq(cryovialTube.id, id))
      }
    }

    if (rawSublabel !== undefined && containerType === 'paper') {
      await database.update(paper).set({ sublabel: newSublabel ?? null }).where(eq(paper.id, id))
    }

    // Return enriched container
    const enriched = await enrichContainerForApi(database, updated)
    return c.json({ container: mapEnrichedContainerToWire(enriched) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
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
