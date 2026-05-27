import { Hono } from 'hono'
import type { Database } from '../db/client'
import { specimen, storageContainer, specimenType } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { listSpecimens } from '../lib/specimens/specimen-read'
import { validateSpecimenData } from '../lib/validation'
import { createContainerForSpecimen, type ContainerData } from '../lib/container-creation'
import { handleRouteError, NotFoundError, ValidationError } from '../lib/error-handler'
import { containerSchema, containerSchemaRequired, containerSchemaWithLocation } from '../lib/schemas'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'
import { requireParam } from '../lib/common-validators'
import { validateBulkSpecimenRows, createBulkSpecimenRows } from '../lib/registration-orchestrator'

/**
 * Create specimens routes with database injection
 * @param database - Database instance (required)
 */
export function createSpecimensRoutes(database: Database): Hono {
  const dbInstance = database
  const specimens = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

// Search specimens
specimens.get('/', authMiddleware, async (c) => {
  try {
    return c.json(await listSpecimens(dbInstance, {
      sourceType: c.req.query('source_type'),
      study: c.req.query('study'),
      subjectId: c.req.query('subject_id'),
      controlBatchId: c.req.query('control_batch_id'),
      specimenTypeId: c.req.query('specimen_type_id'),
      collectionDateFrom: c.req.query('collection_date_from'),
      collectionDateTo: c.req.query('collection_date_to'),
      createdFrom: c.req.query('created_from'),
      createdTo: c.req.query('created_to'),
      barcode: c.req.query('barcode'),
      search: c.req.query('search'),
      page: c.req.query('page'),
      limit: c.req.query('limit'),
    }))
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get specimen by ID
specimens.get('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid specimen ID' }, 400)
    }

    const specimenRecord = await dbInstance
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
      .where(eq(specimen.id, id))
      .get()

    if (!specimenRecord) {
      throw new NotFoundError('Specimen', id)
    }

    return c.json({ specimen: specimenRecord })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Add container to existing specimen
specimens.post('/:id/containers', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid specimen ID' }, 400)
    }

    const specimenRecord = await dbInstance
      .select({ id: specimen.id })
      .from(specimen)
      .where(eq(specimen.id, id))
      .get()

    if (!specimenRecord) {
      throw new NotFoundError('Specimen', id)
    }

    const body = await c.req.json()
    const data = containerSchemaRequired.parse(body) as ContainerData

    const user = c.get('user')
    const result = await createContainerForSpecimen(id, data, dbInstance, user?.id)

    if (!result.success) {
      return c.json({ error: result.error || 'Failed to create container' }, 400)
    }

    return c.json({ containerId: result.containerId }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create specimen
specimens.post('/', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()

    const schema = z.object({
      sourceType: z.enum(['subject', 'control']),
      sourceId: z.number().int().optional(),
      studyShortCode: z.string().optional(),
      subjectName: z.string().optional(),
      specimenTypeId: z.number().int().optional(),
      specimenTypeName: z.string().optional(),
      collectionDate: z.string().optional(),
      container: containerSchema,
    })
    
    const data = schema.parse(body)
    
    const validation = await validateSpecimenData({
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      studyShortCode: data.studyShortCode,
      subjectName: data.subjectName,
      specimenTypeId: data.specimenTypeId,
      specimenTypeName: data.specimenTypeName,
      collectionDate: data.collectionDate,
    }, dbInstance)
    
    if (!validation.valid || !validation.resolved) {
      throw new ValidationError(validation.error || 'Invalid specimen data')
    }
    
    const now = utcNow()
    const user = c.get('user')
    const insertData: any = {
      studySubjectId: validation.resolved.studySubjectId,
      controlBatchId: validation.resolved.controlBatchId,
      specimenTypeId: validation.resolved.specimenTypeId,
      created: now,
      lastUpdated: now,
      createdBy: user?.id,
      updatedBy: user?.id,
    }
    
    if (data.collectionDate) {
      insertData.collectionDate = data.collectionDate
    }
    
    const [newSpecimen] = await dbInstance
      .insert(specimen)
      .values(insertData)
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (!newSpecimen) {
      throw new Error('Insert did not return specimen row')
    }
    let containerResult: { success: boolean; containerId?: number; error?: string } | null = null

    if (data.container) {
      try {
        const result = await createContainerForSpecimen(newSpecimen.id, data.container as ContainerData, dbInstance, user?.id)
        if (!result.success) {
          await dbInstance.delete(storageContainer).where(eq(storageContainer.specimenId, newSpecimen.id))
          await dbInstance.delete(specimen).where(eq(specimen.id, newSpecimen.id))
          throw new ValidationError(result.error || 'Failed to create container')
        }
        containerResult = result
      } catch (err) {
        await dbInstance.delete(storageContainer).where(eq(storageContainer.specimenId, newSpecimen.id))
        await dbInstance.delete(specimen).where(eq(specimen.id, newSpecimen.id))
        throw err instanceof ValidationError ? err : new ValidationError(err instanceof Error ? err.message : 'Failed to create container')
      }
    }
    
    return c.json({
      specimen: {
        ...newSpecimen,
        ...(validation.resolved.studyId != null ? { studyId: validation.resolved.studyId } : {}),
      },
      container: containerResult ? { containerId: containerResult.containerId } : null,
    }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
  })

// Create multiple specimens (bulk)
specimens.post('/bulk', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      specimens: z.array(z.object({
        sourceType: z.enum(['subject', 'control']),
        sourceId: z.number().int().optional(),
        studyShortCode: z.string().optional(),
        subjectName: z.string().optional(),
        specimenTypeName: z.string().min(1),
        collectionDate: z.string().optional(),
        containerBarcode: z.string().optional(),
        container: containerSchemaWithLocation,
      })),
    })
    
    const data = schema.parse(body)

    if (data.specimens.length === 0) {
      return c.json({ error: 'No specimens provided' }, 400)
    }

    const user = c.get('user')
    const createResult = await createBulkSpecimenRows(dbInstance, data.specimens, user?.id)

    if (!createResult.success) {
      return c.json({
        error: 'Validation failed',
        errors: createResult.errors.map(({ index, message }) => ({ index, error: message })),
        created: 0,
      }, 400)
    }

    return c.json({
      specimens: createResult.result.specimens,
      created: createResult.result.created,
      containersCreated: createResult.result.containersCreated,
    }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Validate bulk specimens without creating (same body as POST /specimens/bulk)
specimens.post('/bulk/validate', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      specimens: z.array(z.object({
        sourceType: z.enum(['subject', 'control']),
        sourceId: z.number().int().optional(),
        studyShortCode: z.string().optional(),
        subjectName: z.string().optional(),
        specimenTypeName: z.string().min(1),
        collectionDate: z.string().optional(),
        containerBarcode: z.string().optional(),
        container: containerSchemaWithLocation,
      })),
    })
    const data = schema.parse(body)
    if (data.specimens.length === 0) {
      return c.json({ error: 'No specimens provided' }, 400)
    }
    const result = await validateBulkSpecimenRows(dbInstance, data.specimens)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return specimens
}
