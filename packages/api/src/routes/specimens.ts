import { Hono } from 'hono'
import type { Database } from '../db/client'
import { specimen, storageContainer, studySubject, study, specimenType, controlBatch } from '../db/schema'
import { eq, and, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { validatePage, validateLimit } from '../lib/constants'
import { resolveContainerByBarcode } from '../lib/identifier-resolution'
import { validateSpecimenData, checkDuplicateSpecimens } from '../lib/validation'
import { createContainerForSpecimen, type ContainerData } from '../lib/container-creation'
import { handleRouteError, NotFoundError, ValidationError } from '../lib/error-handler'
import { createAuthMiddleware } from '../middleware/auth'

/**
 * Create specimens routes with database injection
 * @param database - Database instance (required)
 */
export function createSpecimensRoutes(database: Database): Hono {
  const dbInstance = database
  const specimens = new Hono()
  const authMiddleware = createAuthMiddleware(database)

// Search specimens
specimens.get('/', authMiddleware, async (c) => {
  try {
    const sourceType = c.req.query('source_type')
    const studyCode = c.req.query('study')
    const subjectId = c.req.query('subject_id')
    const controlBatchId = c.req.query('control_batch_id')
    const specimenTypeId = c.req.query('specimen_type_id')
    const collectionDateFrom = c.req.query('collection_date_from')
    const collectionDateTo = c.req.query('collection_date_to')
    const createdFrom = c.req.query('created_from')
    const createdTo = c.req.query('created_to')
    const barcode = c.req.query('barcode')
    const search = c.req.query('search')
    
    let query = dbInstance
      .select({
        id: specimen.id,
        studySubjectId: specimen.studySubjectId,
        controlBatchId: specimen.controlBatchId,
        specimenTypeId: specimen.specimenTypeId,
        collectionDate: specimen.collectionDate,
        created: specimen.created,
        specimenType: {
          id: specimenType.id,
          name: specimenType.name,
        },
        studySubject: {
          id: studySubject.id,
          name: studySubject.name,
        },
        study: {
          id: study.id,
          shortCode: study.shortCode,
        },
        controlBatch: {
          id: controlBatch.id,
          name: controlBatch.name,
        }
      })
      .from(specimen)
      .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
      .leftJoin(studySubject, eq(specimen.studySubjectId, studySubject.id))
      .leftJoin(study, eq(studySubject.studyId, study.id))
      .leftJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
      
    const conditions = []
    
    if (sourceType === 'subject') {
      conditions.push(sql`${specimen.studySubjectId} IS NOT NULL`)
    } else if (sourceType === 'control') {
      conditions.push(sql`${specimen.controlBatchId} IS NOT NULL`)
    }
    
    if (studyCode) {
      conditions.push(eq(study.shortCode, studyCode))
    }
    
    if (subjectId) {
      const id = parseInt(subjectId)
      if (!isNaN(id)) {
        conditions.push(eq(specimen.studySubjectId, id))
      }
    }

    if (controlBatchId) {
      const id = parseInt(controlBatchId)
      if (!isNaN(id)) {
        conditions.push(eq(specimen.controlBatchId, id))
      }
    }

    if (specimenTypeId) {
      const id = parseInt(specimenTypeId)
      if (!isNaN(id)) {
        conditions.push(eq(specimen.specimenTypeId, id))
      }
    }

    if (collectionDateFrom) {
      conditions.push(sql`${specimen.collectionDate} >= ${collectionDateFrom}`)
    }
    if (collectionDateTo) {
      conditions.push(sql`${specimen.collectionDate} <= ${collectionDateTo}`)
    }
    if (createdFrom) {
      conditions.push(sql`${specimen.created} >= ${createdFrom}`)
    }
    if (createdTo) {
      conditions.push(sql`${specimen.created} <= ${createdTo}`)
    }

    if (barcode) {
      // Find specimens that have a container with this barcode
      // This requires joins to all the container tables
      const containerId = await resolveContainerByBarcode(dbInstance, barcode)
      if (containerId) {
        const container = await dbInstance
          .select({ specimenId: storageContainer.specimenId })
          .from(storageContainer)
          .where(eq(storageContainer.id, containerId))
          .get()
        if (container) {
          conditions.push(eq(specimen.id, container.specimenId))
        } else {
          return c.json({ specimens: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
        }
      } else {
        return c.json({ specimens: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
      }
    }

    if (search) {
      conditions.push(or(
        like(studySubject.name, `%${search}%`),
        like(controlBatch.name, `%${search}%`),
        like(specimenType.name, `%${search}%`)
      ))
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions) as any) as any
    }
    
    const page = validatePage(c.req.query('page'))
    const limit = await validateLimit(database, c.req.query('limit'))
    const offset = (page - 1) * limit
    
    const countQuery = dbInstance
      .select({ count: sql<number>`COUNT(*)` })
      .from(specimen)
      .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
      .leftJoin(studySubject, eq(specimen.studySubjectId, studySubject.id))
      .leftJoin(study, eq(studySubject.studyId, study.id))
      .leftJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
    
    if (conditions.length > 0) {
      countQuery.where(and(...conditions) as any) as any
    }
    
    const [specimensList, countResult] = await Promise.all([
      query.limit(limit).offset(offset).orderBy(sql`${specimen.created} DESC`),
      countQuery,
    ])
    
    const total = countResult[0]?.count || 0
    
    return c.json({
      specimens: specimensList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get specimen by ID
specimens.get('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
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

// Create specimen
specimens.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    
    const containerSchema = z.object({
      containerType: z.enum(['micronix_tube', 'cryovial_tube', 'paper', 'static_well']).optional(),
      collectionName: z.string().optional(),
      collectionBarcode: z.string().optional(),
      barcode: z.string().optional(),
      position: z.string().optional(),
      label: z.string().optional(),
      unitId: z.number().int().optional(),
      totalQuantity: z.number().optional(),
      remainingQuantity: z.number().optional(),
      comment: z.string().optional(),
    }).optional()
    
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
    
    const now = new Date().toISOString()
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
    
    let containerResult: { success: boolean; containerId?: number; error?: string } | null = null
    
    if (data.container) {
      const user = c.get('user')
      containerResult = await createContainerForSpecimen(newSpecimen.id, data.container as ContainerData, dbInstance, user?.id)
      if (!containerResult.success) {
        await dbInstance.delete(specimen).where(eq(specimen.id, newSpecimen.id))
        throw new ValidationError(containerResult.error || 'Failed to create container')
      }
    }
    
    return c.json({
      specimen: newSpecimen,
      container: containerResult ? { containerId: containerResult.containerId } : null,
    }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
  })

  return specimens
}
