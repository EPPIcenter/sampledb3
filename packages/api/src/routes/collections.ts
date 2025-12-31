import { Hono } from 'hono'
import { db } from '../db/client'
import {
  micronixPlate,
  micronixTube,
  staticWell,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  tube,
  paper,
  sheet,
  storageContainer,
  specimen,
  location,
  studySubject,
  study,
  controlBatch,
  controlDefinition,
  unit,
} from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { executeMoves, resolveContainersByBarcodes, type BatchMoveRequest, type ContainerInfo } from '../lib/container-move'
import { resolveCollection } from '../lib/collection-resolution'
import { executeCollectionMoves, type CollectionMoveRequest } from '../lib/collection-move'

const collections = new Hono()

// Helper to build location path string
function buildLocationPath(loc: typeof location.$inferSelect | null | undefined): string | undefined {
  if (!loc) return undefined
  const parts = [loc.locationRoot, loc.levelI, loc.levelII]
  if (loc.levelIII) parts.push(loc.levelIII)
  return parts.filter(Boolean).join(' → ')
}

// Type for container source (subject or control)
type ContainerSource =
  | {
      type: 'subject'
      id: number
      name: string
      study: {
        id: number
        title: string
        code: string
      }
    }
  | {
      type: 'control'
      id: number
      name: string
      definitionName: string | null
      controlType: string
    }
  | null

// Helper to enrich a storage container
async function enrichContainer(containerId: number) {
  const container = await db
    .select()
    .from(storageContainer)
    .where(eq(storageContainer.id, containerId))
    .get()

  if (!container) return null

  const [containerUnit, spec] = await Promise.all([
    db.select().from(unit).where(eq(unit.id, container.unitId)).get(),
    db.select().from(specimen).where(eq(specimen.id, container.specimenId)).get(),
  ])

  let source: ContainerSource = null
  if (spec?.studySubjectId) {
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

    if (subject && subject.studyTitle && subject.studyCode) {
      source = {
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
  } else if (spec?.controlBatchId) {
    const batch = await db
      .select({
        id: controlBatch.id,
        name: controlBatch.name,
        productionDate: controlBatch.productionDate,
        definitionName: controlDefinition.name,
        controlType: controlDefinition.controlType,
      })
      .from(controlBatch)
      .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
      .where(eq(controlBatch.id, spec.controlBatchId))
      .get()

    if (batch && batch.definitionName && batch.controlType) {
      source = {
        type: 'control',
        id: batch.id,
        name: batch.name,
        definitionName: batch.definitionName,
        controlType: batch.controlType,
      }
    }
  }

  return {
    id: container.id,
    specimenId: container.specimenId,
    unit: containerUnit || null,
    totalQuantity: container.totalQuantity,
    remainingQuantity: container.remainingQuantity,
    comment: container.comment,
    specimen: spec || null,
    source,
  }
}

// Micronix plate detail
collections.get('/plates/micronix/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid plate ID' }, 400)

  const plate = await db.select().from(micronixPlate).where(eq(micronixPlate.id, id)).get()
  if (!plate) return c.json({ error: 'Plate not found' }, 404)

  const [loc, tubes, wells] = await Promise.all([
    db.select().from(location).where(eq(location.id, plate.locationId)).get(),
    db.select().from(micronixTube).where(eq(micronixTube.collectionId, id)),
    db.select().from(staticWell).where(eq(staticWell.collectionId, id)),
  ])

  const locationPath = buildLocationPath(loc)

  const tubeEntries = await Promise.all(
    tubes.map(async (t) => {
      const containerInfo = await enrichContainer(t.id)
      return {
        type: 'micronix_tube',
        id: t.id,
        barcode: t.barcode,
        position: t.position,
        container: containerInfo,
      }
    })
  )

  const wellEntries = await Promise.all(
    wells.map(async (w) => {
      const containerInfo = await enrichContainer(w.id)
      return {
        type: 'static_well',
        id: w.id,
        position: w.position,
        container: containerInfo,
      }
    })
  )

  const wellsByPosition: Record<string, any> = {}
  ;[...tubeEntries, ...wellEntries].forEach((entry) => {
    const pos = entry.position || ''
    wellsByPosition[pos] = entry
  })

  return c.json({
    plate: {
      ...plate,
      location: loc || null,
      locationPath,
    },
    wells: wellsByPosition,
  })
})

// Cryovial box detail
collections.get('/boxes/cryovial/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid box ID' }, 400)

  const boxRecord = await db.select().from(cryovialBox).where(eq(cryovialBox.id, id)).get()
  if (!boxRecord) return c.json({ error: 'Box not found' }, 404)

  const loc = await db.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
  const tubes = await db.select().from(cryovialTube).where(eq(cryovialTube.collectionId, id))

  const tubeEntries = await Promise.all(
    tubes.map(async (t) => {
      const containerInfo = await enrichContainer(t.id)
      return {
        kind: 'cryovial_tube',
        id: t.id,
        barcode: t.barcode,
        position: t.position,
        container: containerInfo,
      }
    })
  )

  const positions: Record<string, any[]> = {}
  tubeEntries.forEach((entry) => {
    const pos = entry.position || ''
    if (!positions[pos]) positions[pos] = []
    positions[pos].push(entry)
  })

  return c.json({
    box: {
      ...boxRecord,
      location: loc || null,
      locationPath: buildLocationPath(loc),
    },
    positions,
  })
})

// Generic box detail
collections.get('/boxes/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid box ID' }, 400)

  const boxRecord = await db.select().from(box).where(eq(box.id, id)).get()
  if (!boxRecord) return c.json({ error: 'Box not found' }, 404)

  const loc = await db.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
  const tubes = await db.select().from(tube).where(eq(tube.boxId, id))

  const tubeEntries = await Promise.all(
    tubes.map(async (t) => {
      const containerInfo = await enrichContainer(t.id)
      return {
        type: 'tube',
        id: t.id,
        boxPosition: t.boxPosition,
        label: t.label,
        container: containerInfo,
      }
    })
  )

  // Get all sheets in this box
  const sheets = await db.select().from(sheet).where(eq(sheet.boxId, id))
  
  // Get all papers for all sheets in this box
  const sheetContents = await Promise.all(
    sheets.map(async (s) => {
      const papers = await db.select().from(paper).where(eq(paper.sheetId, s.id))
      const paperEntries = await Promise.all(
        papers.map(async (p) => {
          const containerInfo = await enrichContainer(p.id)
          return {
            type: 'paper',
            id: p.id,
            barcode: p.barcode,
            position: p.position,
            container: containerInfo,
          }
        })
      )
      return {
        ...s,
        papers: paperEntries
      }
    })
  )

  return c.json({
    box: {
      ...boxRecord,
      location: loc || null,
      locationPath: buildLocationPath(loc),
    },
    contents: {
      tubes: tubeEntries,
      sheets: sheetContents,
    },
  })
})

// Bag detail
collections.get('/bags/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid bag ID' }, 400)

  const bagRecord = await db.select().from(bag).where(eq(bag.id, id)).get()
  if (!bagRecord) return c.json({ error: 'Bag not found' }, 404)

  const loc = await db.select().from(location).where(eq(location.id, bagRecord.locationId)).get()
  
  // Get all sheets in this bag
  const sheets = await db.select().from(sheet).where(eq(sheet.bagId, id))
  
  // Get all papers for all sheets in this bag
  const contents = await Promise.all(
    sheets.map(async (s) => {
      const papers = await db.select().from(paper).where(eq(paper.sheetId, s.id))
      const paperEntries = await Promise.all(
        papers.map(async (p) => {
          const containerInfo = await enrichContainer(p.id)
          return {
            type: 'paper',
            id: p.id,
            barcode: p.barcode,
            position: p.position,
            container: containerInfo,
          }
        })
      )
      return {
        ...s,
        papers: paperEntries
      }
    })
  )

  return c.json({
    bag: {
      ...bagRecord,
      location: loc || null,
      locationPath: buildLocationPath(loc),
    },
    contents: {
      sheets: contents,
    },
  })
})

// Sheet detail (Replaces DBS bag detail)
collections.get('/sheets/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid sheet ID' }, 400)

  const sheetRecord = await db.select().from(sheet).where(eq(sheet.id, id)).get()
  if (!sheetRecord) return c.json({ error: 'Sheet not found' }, 404)

  // Get location info from parent bag or box
  let locationInfo: typeof location.$inferSelect | null = null
  let locationPath: string | undefined
  let parentBox: { id: number; name: string } | null = null
  let parentBag: { id: number; name: string } | null = null
  
  if (sheetRecord.boxId) {
    const parent = await db.select({ box: box, location: location }).from(box).leftJoin(location, eq(box.locationId, location.id)).where(eq(box.id, sheetRecord.boxId)).get()
    locationInfo = parent?.location ?? null
    locationPath = buildLocationPath(locationInfo)
    parentBox = parent?.box ? { id: parent.box.id, name: parent.box.name } : null
  } else if (sheetRecord.bagId) {
    const parent = await db.select({ bag: bag, location: location }).from(bag).leftJoin(location, eq(bag.locationId, location.id)).where(eq(bag.id, sheetRecord.bagId)).get()
    locationInfo = parent?.location ?? null
    locationPath = buildLocationPath(locationInfo)
    parentBag = parent?.bag ? { id: parent.bag.id, name: parent.bag.name } : null
  }

  const papers = await db.select().from(paper).where(eq(paper.sheetId, id))
  const paperEntries = await Promise.all(
    papers.map(async (p) => {
      const containerInfo = await enrichContainer(p.id)
      return {
        type: 'paper',
        id: p.id,
        barcode: p.barcode,
        position: p.position,
        container: containerInfo,
      }
    })
  )

  return c.json({
    sheet: {
      ...sheetRecord,
      location: locationInfo,
      locationPath,
      box: parentBox,
      bag: parentBag,
    },
    papers: paperEntries,
  })
})

// Check collection existence
collections.post('/check', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      collections: z.array(z.object({
        identifier: z.string(),
        type: z.enum(['micronix_plate', 'cryovial_box', 'box', 'bag', 'sheet']),
      })),
    })
    
    const data = schema.parse(body)
    const results = await Promise.all(
      data.collections.map(async (col) => {
        const exists = await resolveCollection(col.identifier, col.type)
        return {
          identifier: col.identifier,
          type: col.type,
          exists: !!exists,
          id: exists || null,
        }
      })
    )
    
    return c.json({ results })
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create micronix plate
collections.post('/plates/micronix', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      locationId: z.number().int(),
      barcode: z.string().optional(),
    })
    
    const data = schema.parse(body)
    
    const existing = await db.select().from(micronixPlate).where(eq(micronixPlate.name, data.name)).get()
    if (existing) return c.json({ error: 'Plate with this name already exists' }, 400)
    
    const now = new Date().toISOString()
    const [newPlate] = await db.insert(micronixPlate).values({
      ...data,
      barcode: data.barcode || null,
      created: now,
      lastUpdated: now,
    }).returning()
    
    return c.json({ plate: newPlate }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Resolve multiple identifiers to container info
collections.post('/containers/resolve', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      identifiers: z.array(
        z.union([
          z.object({ type: z.literal('barcode'), barcode: z.string().min(1) }),
          z.object({ type: z.literal('position'), sourceCollectionName: z.string().min(1), sourcePosition: z.string().min(1) }),
          z.object({ type: z.literal('container_id'), containerId: z.number().int().positive() }),
        ])
      ),
    })
    
    const data = schema.parse(body)
    const { resolveContainersByIdentifiers } = await import('../lib/container-move')
    const containers = await resolveContainersByIdentifiers(data.identifiers)
    
    const result: Array<{ identifier: any; container: ContainerInfo }> = []
    for (const [key, container] of containers.entries()) {
      const identifier = data.identifiers.find(
        (id) =>
          (id.type === 'barcode' && id.barcode === key) ||
          (id.type === 'position' && `${id.sourceCollectionName}:${id.sourcePosition}` === key) ||
          (id.type === 'container_id' && `container_${id.containerId}` === key)
      )
      result.push({ identifier: identifier || key, container })
    }
    
    return c.json({ containers: result })
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// List collections by type
collections.get('/list/:type', async (c) => {
  try {
    const type = c.req.param('type') as any
    let result: any[] = []

    switch (type) {
      case 'micronix_plate': {
        const plates = await db
          .select({
            plate: micronixPlate,
            location: location,
            tubeCount: sql<number>`(SELECT COUNT(*) FROM ${micronixTube} WHERE ${micronixTube.collectionId} = ${micronixPlate.id})`,
            wellCount: sql<number>`(SELECT COUNT(*) FROM ${staticWell} WHERE ${staticWell.collectionId} = ${micronixPlate.id})`,
          })
          .from(micronixPlate)
          .leftJoin(location, eq(micronixPlate.locationId, location.id))
        result = plates.map((r) => ({
          id: r.plate.id,
          name: r.plate.name,
          barcode: r.plate.barcode,
          locationId: r.plate.locationId,
          itemCount: (r.tubeCount || 0) + (r.wellCount || 0),
          location: r.location
            ? {
                id: r.location.id,
                path: buildLocationPath(r.location),
              }
            : null,
        }))
        break
      }
      case 'cryovial_box': {
        const boxes = await db
          .select({
            box: cryovialBox,
            location: location,
            tubeCount: sql<number>`(SELECT COUNT(*) FROM ${cryovialTube} WHERE ${cryovialTube.collectionId} = ${cryovialBox.id})`,
          })
          .from(cryovialBox)
          .leftJoin(location, eq(cryovialBox.locationId, location.id))
        result = boxes.map((r) => ({
          id: r.box.id,
          name: r.box.name,
          barcode: r.box.barcode,
          locationId: r.box.locationId,
          itemCount: r.tubeCount || 0,
          location: r.location
            ? {
                id: r.location.id,
                path: buildLocationPath(r.location),
              }
            : null,
        }))
        break
      }
      case 'box': {
        const boxes = await db
          .select({
            box: box,
            location: location,
            sheetCount: sql<number>`(SELECT COUNT(*) FROM ${sheet} WHERE ${sheet.boxId} = ${box.id})`,
            tubeCount: sql<number>`(SELECT COUNT(*) FROM ${tube} WHERE ${tube.boxId} = ${box.id})`,
          })
          .from(box)
          .leftJoin(location, eq(box.locationId, location.id))
        result = boxes.map((r) => ({
          id: r.box.id,
          name: r.box.name,
          locationId: r.box.locationId,
          itemCount: (r.sheetCount || 0) + (r.tubeCount || 0),
          location: r.location
            ? {
                id: r.location.id,
                path: buildLocationPath(r.location),
              }
            : null,
        }))
        break
      }
      case 'bag': {
        const bags = await db
          .select({
            bag: bag,
            location: location,
            sheetCount: sql<number>`(SELECT COUNT(*) FROM ${sheet} WHERE ${sheet.bagId} = ${bag.id})`,
          })
          .from(bag)
          .leftJoin(location, eq(bag.locationId, location.id))
        result = bags.map((r) => ({
          id: r.bag.id,
          name: r.bag.name,
          locationId: r.bag.locationId,
          itemCount: r.sheetCount || 0,
          location: r.location
            ? {
                id: r.location.id,
                path: buildLocationPath(r.location),
              }
            : null,
        }))
        break
      }
      case 'sheet': {
        const sheets = await db
          .select({
            sheet: sheet,
            paperCount: sql<number>`(SELECT COUNT(*) FROM ${paper} WHERE ${paper.sheetId} = ${sheet.id})`,
          })
          .from(sheet)
        result = sheets.map((r) => ({
          id: r.sheet.id,
          name: r.sheet.name,
          itemCount: r.paperCount || 0,
        }))
        break
      }
    }

    return c.json({ collections: result })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Move containers
collections.post('/containers/move', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      collectionType: z.enum(['micronix_plate', 'cryovial_box', 'box', 'bag', 'sheet']).optional(),
      mappings: z.array(z.object({
        fromCollectionName: z.string().min(1),
        toCollectionName: z.string().min(1),
      })),
      moves: z.array(z.object({
        identifier: z.union([
          z.object({ type: z.literal('barcode'), barcode: z.string().min(1) }),
          z.object({ type: z.literal('position'), sourceCollectionName: z.string().min(1), sourcePosition: z.string().min(1) }),
          z.object({ type: z.literal('container_id'), containerId: z.number().int().positive() }),
        ]),
        targetPosition: z.string().optional(),
      })),
    })
    
    const data = schema.parse(body)
    const result = await executeMoves(data as BatchMoveRequest)
    
    if (!result.success) {
      return c.json({ error: 'Move operation failed', moved: result.moved, errors: result.errors }, 400)
    }
    
    return c.json({ success: true, moved: result.moved })
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error: 'Invalid input', details: error.issues }, 400)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Move sheets
collections.post('/sheets/move', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      sheetIds: z.array(z.number().int().positive()),
      targetCollectionId: z.number().int().positive(),
      targetCollectionType: z.enum(['box', 'bag']),
    })

    const result = schema.safeParse(body)
    if (!result.success) {
      return c.json({ error: 'Invalid input', details: result.error.issues }, 400)
    }
    const data = result.data

    // Verify target collection exists
    if (data.targetCollectionType === 'box') {
      const exists = await db.select().from(box).where(eq(box.id, data.targetCollectionId)).get()
      if (!exists) return c.json({ error: 'Target box not found' }, 404)
    } else {
      const exists = await db.select().from(bag).where(eq(bag.id, data.targetCollectionId)).get()
      if (!exists) return c.json({ error: 'Target bag not found' }, 404)
    }

    db.transaction((tx) => {
      for (const sheetId of data.sheetIds) {
        if (data.targetCollectionType === 'box') {
          tx.update(sheet)
            .set({
              boxId: data.targetCollectionId,
              bagId: null,
              lastUpdated: sql`current_timestamp`,
            })
            .where(eq(sheet.id, sheetId))
            .run()
        } else {
          tx.update(sheet)
            .set({
              bagId: data.targetCollectionId,
              boxId: null,
              lastUpdated: sql`current_timestamp`,
            })
            .where(eq(sheet.id, sheetId))
            .run()
        }
      }
    })

    return c.json({ success: true, moved: data.sheetIds.length })
  } catch (error: unknown) {
    console.error('Error moving sheets:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error ? error.name : 'Internal server error'
    return c.json(
      {
        error: errorName,
        message: errorMessage,
      },
      500
    )
  }
})

// Move collections
collections.post('/move', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      collectionType: z.enum(['micronix_plate', 'cryovial_box', 'box', 'bag']),
      moves: z.array(z.object({
        identifier: z.union([
          z.object({ type: z.literal('id'), id: z.number().int().positive() }),
          z.object({
            type: z.literal('name'),
            name: z.string().min(1),
            locationId: z.number().int().positive().optional(),
            locationPath: z.string().optional(),
          }),
          z.object({
            type: z.literal('barcode'),
            barcode: z.string().min(1),
            locationId: z.number().int().positive().optional(),
            locationPath: z.string().optional(),
          }),
        ]),
        targetLocationId: z.number().int().positive(),
      })),
    })

    const result = schema.safeParse(body)
    if (!result.success) {
      return c.json({ error: 'Invalid input', details: result.error.issues }, 400)
    }
    const data = result.data

    const moveResult = await executeCollectionMoves(data as CollectionMoveRequest)

    if (!moveResult.success) {
      return c.json({
        error: 'Move operation failed',
        moved: moveResult.moved,
        errors: moveResult.errors,
      }, 400)
    }

    return c.json({
      success: true,
      moved: moveResult.moved,
      errors: moveResult.errors,
    })
  } catch (error: unknown) {
    console.error('Error moving collections:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return c.json(
      {
        error: 'Internal server error',
        message: errorMessage,
      },
      500
    )
  }
})

export default collections
