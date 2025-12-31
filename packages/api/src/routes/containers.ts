import { Hono } from 'hono'
import { db } from '../db/client'
import { storageContainer, specimen, location, unit, micronixTube, cryovialTube, micronixPlate, cryovialBox, studySubject, study, specimenType, controlBatch, controlDefinition, tube, box, paper, sheet, bag, staticWell, tag, storageContainerTag } from '../db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { validatePage, validateLimit } from '../lib/constants'

const containers = new Hono()

// Helper function to build full location path
function buildLocationPath(loc: any, parentName?: string): string {
  if (!loc) return parentName || ''
  const parts = [loc.locationRoot, loc.levelI, loc.levelII]
  if (loc.levelIII) parts.push(loc.levelIII)
  let path = parts.filter(Boolean).join(' → ')
  if (parentName) {
    path += ` → ${parentName}`
  }
  return path
}

async function enrichContainerDetailed(container: any) {
  const id = container.id

  // Get unit and tags
  const [containerUnit, containerTags] = await Promise.all([
    db.select().from(unit).where(eq(unit.id, container.unitId)).get(),
    db.select({ id: tag.id, name: tag.name })
      .from(tag)
      .innerJoin(storageContainerTag, eq(tag.id, storageContainerTag.tagId))
      .where(eq(storageContainerTag.storageContainerId, id)),
  ])

  // Check all possible subtypes
  const [micronixInfo, cryovialInfo, tubeInfo, paperInfo, staticWellInfo] = await Promise.all([
    db.select({
      barcode: micronixTube.barcode,
      position: micronixTube.position,
      plateId: micronixPlate.id,
      plateName: micronixPlate.name,
      locationId: micronixPlate.locationId,
    }).from(micronixTube).leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id)).where(eq(micronixTube.id, id)).get(),

    db.select({
      barcode: cryovialTube.barcode,
      position: cryovialTube.position,
      boxId: cryovialBox.id,
      boxName: cryovialBox.name,
      locationId: cryovialBox.locationId,
    }).from(cryovialTube).leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id)).where(eq(cryovialTube.id, id)).get(),

    db.select({
      boxPosition: tube.boxPosition,
      label: tube.label,
      boxId: box.id,
      boxName: box.name,
      locationId: box.locationId,
    }).from(tube).leftJoin(box, eq(tube.boxId, box.id)).where(eq(tube.id, id)).get(),

    db.select({
      barcode: paper.barcode,
      position: paper.position,
      sheetId: sheet.id,
      sheetName: sheet.name,
      boxId: sheet.boxId,
      bagId: sheet.bagId,
    }).from(paper).leftJoin(sheet, eq(paper.sheetId, sheet.id)).where(eq(paper.id, id)).get(),

    db.select({
      position: staticWell.position,
      plateId: micronixPlate.id,
      plateName: micronixPlate.name,
      locationId: micronixPlate.locationId,
    }).from(staticWell).leftJoin(micronixPlate, eq(staticWell.collectionId, micronixPlate.id)).where(eq(staticWell.id, id)).get(),
  ])

  let containerType = 'unknown'
  let locationId: number | null = null
  let collectionInfo: any = null
  let parentContainerName: string | undefined

  if (micronixInfo) {
    containerType = 'micronix_tube'
    locationId = micronixInfo.locationId
    collectionInfo = { type: 'micronix_plate', id: micronixInfo.plateId, name: micronixInfo.plateName, position: micronixInfo.position, barcode: micronixInfo.barcode }
  } else if (cryovialInfo) {
    containerType = 'cryovial_tube'
    locationId = cryovialInfo.locationId
    collectionInfo = { type: 'cryovial_box', id: cryovialInfo.boxId, name: cryovialInfo.boxName, position: cryovialInfo.position, barcode: cryovialInfo.barcode }
  } else if (tubeInfo) {
    containerType = 'tube'
    locationId = tubeInfo.locationId
    collectionInfo = { type: 'box', id: tubeInfo.boxId, name: tubeInfo.boxName, position: tubeInfo.boxPosition, label: tubeInfo.label }
  } else if (paperInfo) {
    containerType = 'paper'
    collectionInfo = { type: 'sheet', id: paperInfo.sheetId, name: paperInfo.sheetName, position: paperInfo.position, barcode: paperInfo.barcode }
    
    // For paper, location is on the parent box or bag
    if (paperInfo.boxId) {
      const parentBox = await db.select({ locationId: box.locationId, name: box.name }).from(box).where(eq(box.id, paperInfo.boxId)).get()
      locationId = parentBox?.locationId || null
      parentContainerName = parentBox?.name
    } else if (paperInfo.bagId) {
      const parentBag = await db.select({ locationId: bag.locationId, name: bag.name }).from(bag).where(eq(bag.id, paperInfo.bagId)).get()
      locationId = parentBag?.locationId || null
      parentContainerName = parentBag?.name
    }
  } else if (staticWellInfo) {
    containerType = 'static_well'
    locationId = staticWellInfo.locationId
    collectionInfo = { type: 'micronix_plate', id: staticWellInfo.plateId, name: staticWellInfo.plateName, position: staticWellInfo.position }
  }

  // Get location details
  let locationInfo: any = null
  if (locationId) {
    locationInfo = await db.select().from(location).where(eq(location.id, locationId)).get()
  }

  return {
    ...container,
    containerType,
    tags: containerTags,
    unit: containerUnit,
    location: locationInfo,
    locationPath: buildLocationPath(locationInfo, parentContainerName),
    collection: collectionInfo,
    micronixTube: micronixInfo,
    cryovialTube: cryovialInfo,
    tube: tubeInfo,
    paper: paperInfo,
    staticWell: staticWellInfo,
  }
}

// List containers with filters
containers.get('/', async (c) => {
  try {
    const specimenId = c.req.query('specimen_id')
    const locationId = c.req.query('location_id')
    const tagIds = c.req.queries('tag_ids')?.map(id => parseInt(id)).filter(id => !isNaN(id))
    const page = validatePage(c.req.query('page'))
    const limit = await validateLimit(c.req.query('limit'))
    const offset = (page - 1) * limit
    
    let query = db.select().from(storageContainer)
    let countQuery = db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(storageContainer)
    
    const conditions = []
    
    if (specimenId) {
      const id = parseInt(specimenId)
      if (!isNaN(id)) {
        conditions.push(eq(storageContainer.specimenId, id))
      }
    }
    
    // Filter by tags if provided
    if (tagIds && tagIds.length > 0) {
      const containerIdsWithTags = await db
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
    const enrichedContainers = await Promise.all(
      containersList.map(container => enrichContainerDetailed(container))
    )
    
    return c.json({
      containers: enrichedContainers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('Error fetching containers:', error)
    return c.json({ error: 'Failed to fetch containers', details: error.message }, 500)
  }
})

// Get container by ID with full details
containers.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    // Get base container
    const container = await db
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.id, id))
      .get()

    if (!container) {
      return c.json({ error: 'Container not found' }, 404)
    }

    const enriched = await enrichContainerDetailed(container)

    // Get specimen details with type
    const spec = await db
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
      .get()

    // Get source information
    let sourceInfo: any = null
    if (spec) {
      if (spec.studySubjectId) {
        const subject = await db
          .select({
            id: studySubject.id,
            name: studySubject.name,
            studyId: studySubject.studyId,
            studyTitle: study.title,
            studyCode: study.shortCode,
          })
          .from(studySubject)
          .leftJoin(study, eq(studySubject.studyId, study.id))
          .where(eq(studySubject.id, spec.studySubjectId))
          .get()
        
        if (subject) {
          sourceInfo = {
            type: 'subject',
            id: subject.id,
            name: subject.name,
            study: {
              id: subject.studyId,
              title: subject.studyTitle,
              code: subject.studyCode,
            },
          }
        }
      } else if (spec.controlBatchId) {
        const batch = await db
          .select({
            id: controlBatch.id,
            name: controlBatch.name,
            productionDate: controlBatch.productionDate,
            definitionId: controlDefinition.id,
            definitionName: controlDefinition.name,
          })
          .from(controlBatch)
          .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
          .where(eq(controlBatch.id, spec.controlBatchId))
          .get()

        if (batch) {
          sourceInfo = {
            type: 'control',
            id: batch.id,
            name: batch.name,
            productionDate: batch.productionDate,
            definition: {
              id: batch.definitionId,
              name: batch.definitionName,
            }
          }
        }
      }
    }

    return c.json({
      container: enriched,
      specimen: spec,
      source: sourceInfo,
      ...enriched,
    })
  } catch (error: any) {
    console.error('Error fetching container:', error)
    return c.json({ error: 'Failed to fetch container', details: error.message }, 500)
  }
})

// Update container
containers.patch('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      comment: z.string().optional(),
      remainingQuantity: z.number().optional(),
      tagIds: z.array(z.number().int()).optional(), // Replace tags
    })
    
    const data = schema.parse(body)
    const { tagIds, ...updateData } = data
    
    // Update container fields (excluding tagIds)
    const [updated] = await db
      .update(storageContainer)
      .set({
        ...updateData,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(storageContainer.id, id))
      .returning()
    
    if (!updated) {
      return c.json({ error: 'Container not found' }, 404)
    }
    
    // Update tags if provided
    if (tagIds !== undefined) {
      // Remove all existing tags
      await db.delete(storageContainerTag)
        .where(eq(storageContainerTag.storageContainerId, id))
      
      // Add new tags
      if (tagIds.length > 0) {
        await db.insert(storageContainerTag).values(
          tagIds.map(tagId => ({
            storageContainerId: id,
            tagId,
          }))
        )
      }
    }
    
    // Return enriched container
    const enriched = await enrichContainerDetailed(updated)
    return c.json({ container: enriched })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get container tags
containers.get('/:id/tags', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const tags = await db
      .select({ id: tag.id, name: tag.name })
      .from(tag)
      .innerJoin(storageContainerTag, eq(tag.id, storageContainerTag.tagId))
      .where(eq(storageContainerTag.storageContainerId, id))

    return c.json({ tags })
  } catch (error: any) {
    console.error('Error fetching container tags:', error)
    return c.json({ error: 'Failed to fetch container tags', details: error.message }, 500)
  }
})

// Add tag to container
containers.post('/:id/tags', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      tagId: z.number().int(),
    })
    
    const { tagId } = schema.parse(body)

    // Check if container exists
    const container = await db.select().from(storageContainer).where(eq(storageContainer.id, id)).get()
    if (!container) {
      return c.json({ error: 'Container not found' }, 404)
    }

    // Check if tag exists
    const tagRecord = await db.select().from(tag).where(eq(tag.id, tagId)).get()
    if (!tagRecord) {
      return c.json({ error: 'Tag not found' }, 404)
    }

    // Add tag (ignore if already exists due to primary key constraint)
    try {
      await db.insert(storageContainerTag).values({
        storageContainerId: id,
        tagId,
      })
    } catch (error: any) {
      // Ignore duplicate key errors
      if (!error.message?.includes('UNIQUE constraint')) {
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
containers.delete('/:id/tags/:tagId', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const tagId = parseInt(c.req.param('tagId'))
    
    if (isNaN(id) || isNaN(tagId)) {
      return c.json({ error: 'Invalid container ID or tag ID' }, 400)
    }

    await db.delete(storageContainerTag)
      .where(
        and(
          eq(storageContainerTag.storageContainerId, id),
          eq(storageContainerTag.tagId, tagId)
        )
      )

    return c.json({ success: true })
  } catch (error: any) {
    console.error('Error removing container tag:', error)
    return c.json({ error: 'Failed to remove tag', details: error.message }, 500)
  }
})

export default containers
