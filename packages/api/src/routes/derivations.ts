import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/client'
import {
  containerDerivation,
  storageContainer,
  specimen,
  micronixPlate,
  cryovialBox,
  box,
  bag,
  sheet,
  studySubject,
  study,
  controlBatch,
  controlDefinition,
} from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { createDerivation } from '../lib/derivations'

const derivations = new Hono()

const createDerivationSchema = z.object({
  derivationType: z.string(),
  specimenTypeName: z.string(),
  containerType: z.enum(['micronix_tube', 'cryovial_tube', 'paper', 'static_well']),
  quantity: z.number().optional(),
  unitSymbol: z.string().optional(),
  quantityUsed: z.number().optional(),
  reduceParentQuantity: z.boolean().optional().default(true),
  derivationDate: z.string().optional(),
  protocol: z.string().optional(),
  notes: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  collectionId: z.number().optional(),
  collectionName: z.string().optional(),
  collectionType: z.enum(['micronix_plate', 'cryovial_box', 'sheet', 'box', 'bag']).optional(),
  collectionLocationId: z.number().optional(),
  sheetParentType: z.enum(['box', 'bag']).optional(),
  sheetParentName: z.string().optional(),
  containerBarcode: z.string().optional(),
  position: z.string().optional(),
  operatorId: z.number().optional(),
})

async function createCollectionIfNeeded(input: z.infer<typeof createDerivationSchema>) {
  if (input.collectionId || !input.collectionName || !input.collectionType || !input.collectionLocationId) {
    return input.collectionId
  }

  const name = input.collectionName
  const locationId = input.collectionLocationId
  const now = new Date().toISOString()

  switch (input.collectionType) {
    case 'micronix_plate': {
      const [plate] = await db.insert(micronixPlate).values({
        name,
        locationId,
        barcode: null,
        created: now,
        lastUpdated: now,
      }).returning()
      return plate.id
    }
    case 'cryovial_box': {
      const [boxRow] = await db.insert(cryovialBox).values({
        name,
        locationId,
        barcode: null,
        created: now,
        lastUpdated: now,
      }).returning()
      return boxRow.id
    }
    case 'box': {
      const [boxRow] = await db.insert(box).values({
        name,
        locationId,
        created: now,
        lastUpdated: now,
      }).returning()
      return boxRow.id
    }
    case 'bag': {
      const [bagRow] = await db.insert(bag).values({
        name,
        locationId,
        created: now,
        lastUpdated: now,
      }).returning()
      return bagRow.id
    }
    case 'sheet': {
      // For sheets, we need a box or bag parent. Check input for sheetParentType and sheetParentName.
      if (!input.sheetParentType || !input.sheetParentName) {
        throw new Error('sheetParentType and sheetParentName are required for sheet creation')
      }

      let parentId: number

      if (input.sheetParentType === 'box') {
        // Find or create box at the location
        let boxRecord = await db
          .select()
          .from(box)
          .where(and(eq(box.name, input.sheetParentName), eq(box.locationId, locationId)))
          .get()

        if (!boxRecord) {
          // Create new box
          const [newBox] = await db.insert(box).values({
            name: input.sheetParentName,
            locationId,
            created: now,
            lastUpdated: now,
          }).returning()
          parentId = newBox.id
        } else {
          parentId = boxRecord.id
        }

        // Create sheet with boxId
        const [newSheet] = await db.insert(sheet).values({
          name,
          boxId: parentId,
          bagId: null,
          created: now,
          lastUpdated: now,
        }).returning()
        return newSheet.id
      } else {
        // Find or create bag at the location
        let bagRecord = await db
          .select()
          .from(bag)
          .where(and(eq(bag.name, input.sheetParentName), eq(bag.locationId, locationId)))
          .get()

        if (!bagRecord) {
          // Create new bag
          const [newBag] = await db.insert(bag).values({
            name: input.sheetParentName,
            locationId,
            created: now,
            lastUpdated: now,
          }).returning()
          parentId = newBag.id
        } else {
          parentId = bagRecord.id
        }

        // Create sheet with bagId
        const [newSheet] = await db.insert(sheet).values({
          name,
          boxId: null,
          bagId: parentId,
          created: now,
          lastUpdated: now,
        }).returning()
        return newSheet.id
      }
    }
    default:
      return input.collectionId
  }
}

// Create derivation from parent container
derivations.post('/containers/:id/derive', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const body = await c.req.json()
    const input = createDerivationSchema.parse(body)

    const collectionId = await createCollectionIfNeeded(input)

    const result = await createDerivation({
      parentContainerId: id,
      ...input,
      collectionId,
    })

    return c.json(result)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error creating derivation:', error)
    return c.json({ error: 'Failed to create derivation', details: error.message }, 500)
  }
})

// List derivations from a parent container
derivations.get('/containers/:id/derivations', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    const derivationType = c.req.query('derivation_type') || undefined

    const where = derivationType
      ? and(
        eq(containerDerivation.parentContainerId, id),
        eq(containerDerivation.derivationType, derivationType),
      )
      : eq(containerDerivation.parentContainerId, id)

    const records = await db
      .select()
      .from(containerDerivation)
      .where(where)

    return c.json({
      derivations: records,
      count: records.length,
    })
  } catch (error: any) {
    console.error('Error listing derivations:', error)
    return c.json({ error: 'Failed to list derivations', details: error.message }, 500)
  }
})

// Get derivation source for a child container, or original source if not derived
derivations.get('/containers/:id/source', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    // First check if this container is derived
    const record = await db
      .select()
      .from(containerDerivation)
      .where(eq(containerDerivation.childContainerId, id))
      .get()

    if (record) {
      // Container is derived - return derivation source
      const parent = await db
        .select()
        .from(storageContainer)
        .where(eq(storageContainer.id, record.parentContainerId))
        .get()

      if (!parent) {
        return c.json({ error: 'Parent container not found' }, 404)
      }

      const parentSpecimen = await db
        .select()
        .from(specimen)
        .where(eq(specimen.id, parent.specimenId))
        .get()

      return c.json({
        type: 'derivation',
        derivation: record,
        parentContainer: parent,
        parentSpecimen,
      })
    }

    // Container is not derived - return original source (subject or control)
    const container = await db
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.id, id))
      .get()

    if (!container) {
      return c.json({ error: 'Container not found' }, 404)
    }

    const spec = await db
      .select()
      .from(specimen)
      .where(eq(specimen.id, container.specimenId))
      .get()

    if (!spec) {
      return c.json({ error: 'Specimen not found for container' }, 404)
    }

    let sourceInfo: any = null
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

    if (!sourceInfo) {
      return c.json({ error: 'Source not found for container' }, 404)
    }

    return c.json({
      type: 'original',
      source: sourceInfo,
      container,
      specimen: spec,
    })
  } catch (error: any) {
    console.error('Error fetching container source:', error)
    return c.json({ error: 'Failed to fetch container source', details: error.message }, 500)
  }
})

// Simple derivation chain: ancestors and direct descendants
derivations.get('/containers/:id/derivation-chain', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid container ID' }, 400)
    }

    // Ancestors: walk up via parent_container_id
    const ancestors: any[] = []
    let currentId: number | null = id
    while (true) {
      const record = await db
        .select()
        .from(containerDerivation)
        .where(eq(containerDerivation.childContainerId, currentId!))
        .get()
      if (!record) break

      const parent = await db
        .select()
        .from(storageContainer)
        .where(eq(storageContainer.id, record.parentContainerId))
        .get()
      if (!parent) break

      ancestors.unshift({ container: parent, derivation: record })
      currentId = record.parentContainerId
    }

    // Descendants: direct children only for now
    const descendantsRecords = await db
      .select()
      .from(containerDerivation)
      .where(eq(containerDerivation.parentContainerId, id))

    const descendants = await Promise.all(
      descendantsRecords.map(async (d) => {
        const child = await db
          .select()
          .from(storageContainer)
          .where(eq(storageContainer.id, d.childContainerId))
          .get()
        return { container: child, derivation: d }
      }),
    )

    const current = await db
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.id, id))
      .get()

    return c.json({
      ancestors,
      descendants,
      current,
    })
  } catch (error: any) {
    console.error('Error fetching derivation chain:', error)
    return c.json({ error: 'Failed to fetch derivation chain', details: error.message }, 500)
  }
})

// Update derivation metadata
derivations.patch('/derivations/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid derivation ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      derivationDate: z.string().optional(),
      protocol: z.string().optional(),
      notes: z.string().optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    const data = schema.parse(body)

    const [updated] = await db
      .update(containerDerivation)
      .set({
        derivationDate: data.derivationDate,
        protocol: data.protocol,
        notes: data.notes,
        properties: data.properties as any,
      })
      .where(eq(containerDerivation.id, id))
      .returning()

    if (!updated) {
      return c.json({ error: 'Derivation not found' }, 404)
    }

    return c.json({ derivation: updated })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error updating derivation:', error)
    return c.json({ error: 'Failed to update derivation', details: error.message }, 500)
  }
})

// Delete derivation (relationship only)
derivations.delete('/derivations/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid derivation ID' }, 400)
    }

    const existing = await db
      .select()
      .from(containerDerivation)
      .where(eq(containerDerivation.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Derivation not found' }, 404)
    }

    await db
      .delete(containerDerivation)
      .where(eq(containerDerivation.id, id))

    return c.json({ message: 'Derivation deleted' })
  } catch (error: any) {
    console.error('Error deleting derivation:', error)
    return c.json({ error: 'Failed to delete derivation', details: error.message }, 500)
  }
})

export default derivations


