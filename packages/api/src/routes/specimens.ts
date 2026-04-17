import { Hono } from 'hono'
import type { Database } from '../db/client'
import { specimen, storageContainer, studySubject, study, specimenType, controlBatch, micronixTube, cryovialTube, staticWell } from '../db/schema'
import { eq, and, like, or, sql } from 'drizzle-orm'
import { normalizePosition } from '../lib/bulk-combined-import'
import { z } from 'zod'
import { validatePage, validateLimit } from '../lib/constants'
import { resolveContainerByBarcode } from '../lib/identifier-resolution'
import { validateSpecimenData, checkDuplicateSpecimens } from '../lib/validation'
import { createContainerForSpecimen, validateContainerData, type ContainerData } from '../lib/container-creation'
import { findExistingStudySpecimen, findExistingControlSpecimen } from '../lib/specimen-helpers'
import { validateContainerTypeForSpecimenType } from '../lib/validation'
import { resolveCollection } from '../lib/collection-resolution'
import { handleRouteError, NotFoundError, ValidationError } from '../lib/error-handler'
import { containerSchema, containerSchemaRequired, containerSchemaWithLocation } from '../lib/schemas'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'

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
    
    const pageParam = c.req.query('page')
    const limitParam = c.req.query('limit')
    
    // If no pagination params provided, return all specimens (for client-side pagination)
    const returnAll = !pageParam && !limitParam
    
    const page = pageParam ? validatePage(pageParam) : 1
    let limit: number | undefined
    if (returnAll) {
      limit = undefined
    } else if (limitParam) {
      limit = await validateLimit(database, limitParam)
    } else {
      limit = 50 // Default limit when page is provided but limit is not
    }
    const offset = returnAll ? undefined : (page - 1) * limit!
    
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
    
    let queryWithOrder = query.orderBy(sql`${specimen.created} DESC`)
    if (!returnAll) {
      queryWithOrder = queryWithOrder.limit(limit!).offset(offset!) as any
    }
    
    const [specimensList, countResult] = await Promise.all([
      queryWithOrder,
      countQuery,
    ])
    
    const total = countResult[0]?.count || 0
    
    return c.json({
      specimens: specimensList,
      pagination: returnAll ? undefined : {
        page,
        limit: limit!,
        total,
        totalPages: Math.ceil(total / limit!),
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

// Add container to existing specimen
specimens.post('/:id/containers', memberMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
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
      specimen: newSpecimen,
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
    
    const errors: Array<{ index: number; error: string }> = []
    const now = utcNow()
    const user = c.get('user')
    
    // Phase 1: validate all rows (async)
    type ValidRow = { index: number; spec: (typeof data.specimens)[number]; validation: Awaited<ReturnType<typeof validateSpecimenData>> & { valid: true; resolved: NonNullable<Awaited<ReturnType<typeof validateSpecimenData>>['resolved']> } }
    const validRows: ValidRow[] = []
    for (let i = 0; i < data.specimens.length; i++) {
      const spec = data.specimens[i]
      try {
        const validation = await validateSpecimenData({
          sourceType: spec.sourceType,
          sourceId: spec.sourceId,
          studyShortCode: spec.studyShortCode,
          subjectName: spec.subjectName,
          specimenTypeName: spec.specimenTypeName,
          collectionDate: spec.collectionDate,
        }, dbInstance)
        if (!validation.valid || !validation.resolved) {
          errors.push({ index: i, error: validation.error || 'Invalid specimen data' })
          continue
        }
        if (spec.container?.containerType) {
          const containerType = spec.container.containerType
          const containerTypeValidation = await validateContainerTypeForSpecimenType(dbInstance, validation.resolved.specimenTypeId, containerType)
          if (!containerTypeValidation.valid) {
            errors.push({ index: i, error: containerTypeValidation.error || 'Invalid container type for specimen type' })
            continue
          }
          const containerDataForValidation: ContainerData = {
            containerType,
            collectionName: spec.container.collectionName,
            collectionBarcode: spec.container.collectionBarcode,
            barcode: spec.container.barcode,
            position: spec.container.position,
            label: spec.container.label,
          }
          const containerValidation = await validateContainerData(dbInstance, containerType, containerDataForValidation)
          if (!containerValidation.valid) {
            errors.push({ index: i, error: containerValidation.error || 'Invalid container data' })
            continue
          }
          const collectionType = containerType === 'cryovial_tube' ? 'cryovial_box' : 'micronix_plate'
          const identifier = spec.container.collectionName || spec.container.collectionBarcode
          if (containerType !== 'paper' && identifier) {
            const existingId = await resolveCollection(identifier, collectionType, dbInstance)
            if (!existingId && !spec.container.collectionLocationId) {
              errors.push({ index: i, error: `Collection '${identifier}' not found. Create it first or use Combined import with a location.` })
              continue
            }
          }
          if (containerType === 'paper' && spec.container.collectionName) {
            const existingBox = await resolveCollection(spec.container.collectionName, 'box', dbInstance)
            if (!existingBox && !spec.container.collectionLocationId) {
              errors.push({ index: i, error: `Box '${spec.container.collectionName}' not found. Create it first or use Combined import with a location.` })
              continue
            }
          }
        }
        validRows.push({ index: i, spec, validation: validation as ValidRow['validation'] })
      } catch (error: unknown) {
        errors.push({ index: i, error: error instanceof Error ? error.message : 'Validation failed' })
      }
    }

    // All-or-nothing: do not insert if any row failed validation
    if (errors.length > 0) {
      return c.json({
        error: 'Validation failed',
        errors,
        created: 0,
      }, 400)
    }

    // One specimen per unique (subject/control + type + date). Use payload key so dedupe is stable regardless of resolved ID quirks.
    const payloadKey = (r: (typeof validRows)[number], idx: number): string =>
      r.spec.sourceType === 'subject'
        ? `s:${String(r.spec.studyShortCode ?? '')}:${String(r.spec.subjectName ?? '')}:${String(r.spec.specimenTypeName)}:${String(r.spec.collectionDate ?? '')}`
        : `c:${String(r.validation.resolved.controlBatchId ?? '')}:${String(r.validation.resolved.specimenTypeId)}:${String(r.spec.collectionDate ?? '')}`
    const orderedPayloadKeys = validRows.map((r, idx) => payloadKey(r, idx))
    const payloadKeyToFirstIndex = new Map<string, number>()
    for (let idx = 0; idx < orderedPayloadKeys.length; idx++) {
      const k = orderedPayloadKeys[idx]
      if (!payloadKeyToFirstIndex.has(k)) payloadKeyToFirstIndex.set(k, idx)
    }
    const uniqueSpecimenOrder: number[] = []
    const indexToUniqueIndex: number[] = []
    for (let idx = 0; idx < orderedPayloadKeys.length; idx++) {
      const first = payloadKeyToFirstIndex.get(orderedPayloadKeys[idx]) ?? idx
      if (first === idx) uniqueSpecimenOrder.push(idx)
      indexToUniqueIndex.push(uniqueSpecimenOrder.indexOf(first))
    }

    // Phase 1: sync transaction to create/get specimens (one per unique key). No await so tx sees own inserts.
    const specimenRecordsByUniqueIndex: (typeof specimen.$inferSelect)[] = []
    const syncResult = dbInstance.transaction((tx) => {
      const dbTx = tx as unknown as Database
      let newCount = 0
      for (const uniqueIdx of uniqueSpecimenOrder) {
        const { spec, validation } = validRows[uniqueIdx]
        const studySubjectId = validation.resolved.studySubjectId
        const existing =
          spec.sourceType === 'subject' && studySubjectId != null
            ? findExistingStudySpecimen(dbTx, studySubjectId, validation.resolved.specimenTypeId, spec.collectionDate)
            : spec.sourceType === 'control' && validation.resolved.controlBatchId != null
              ? findExistingControlSpecimen(dbTx, validation.resolved.controlBatchId, validation.resolved.specimenTypeId, spec.collectionDate)
              : null
        if (existing) {
          specimenRecordsByUniqueIndex.push(existing)
        } else {
          const insertResult = tx
            .insert(specimen)
            .values({
              studySubjectId: validation.resolved.studySubjectId,
              controlBatchId: validation.resolved.controlBatchId,
              specimenTypeId: validation.resolved.specimenTypeId,
              collectionDate: spec.collectionDate ?? null,
              created: now,
              lastUpdated: now,
              createdBy: user?.id,
              updatedBy: user?.id,
            })
            .returning()
            .get()
          const inserted = Array.isArray(insertResult) ? insertResult[0] : insertResult
          if (!inserted) throw new Error('Insert did not return specimen row')
          specimenRecordsByUniqueIndex.push(inserted as typeof specimen.$inferSelect)
          newCount += 1
        }
      }
      return { newCount }
    })

    // Phase 2: create containers (async) in a second transaction so all-or-nothing
    const specimensOut: typeof specimen.$inferSelect[] = indexToUniqueIndex.map((ui) => specimenRecordsByUniqueIndex[ui])
    let containersCount = 0
    await dbInstance.transaction(async (tx) => {
      const dbTx = tx as unknown as Database
      for (let i = 0; i < validRows.length; i++) {
        const { spec } = validRows[i]
        const specimenRecord = specimensOut[i]
        if (!spec.container?.containerType) continue
        const containerData: ContainerData = {
          containerType: spec.container.containerType,
          collectionName: spec.container.collectionName,
          collectionBarcode: spec.container.collectionBarcode,
          barcode: spec.container.barcode,
          position: spec.container.position,
          label: spec.container.label,
          unitId: spec.container.unitId,
          totalQuantity: spec.container.totalQuantity,
          remainingQuantity: spec.container.remainingQuantity,
          comment: spec.container.comment,
        }
        const containerResult = await createContainerForSpecimen(
          specimenRecord.id,
          containerData,
          dbTx,
          user?.id
        )
        if (!containerResult.success || !containerResult.containerId) {
          throw new Error(containerResult.error ?? `Row ${i}: failed to create container`)
        }
        containersCount += 1
      }
    })

    const result = {
      specimens: specimensOut,
      created: syncResult.newCount,
      containersCreated: containersCount,
    }

    return c.json({
      specimens: result.specimens,
      created: result.created,
      containersCreated: result.containersCreated,
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
    const errors: Array<{ index: number; message: string }> = []
    type ValidRow = { index: number; spec: (typeof data.specimens)[number]; validation: Awaited<ReturnType<typeof validateSpecimenData>> & { valid: true; resolved: NonNullable<Awaited<ReturnType<typeof validateSpecimenData>>['resolved']> }; collectionId?: number | null; collectionKey?: string; containerType?: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' }
    const validRows: ValidRow[] = []
    for (let i = 0; i < data.specimens.length; i++) {
      const spec = data.specimens[i]
      try {
        const validation = await validateSpecimenData({
          sourceType: spec.sourceType,
          sourceId: spec.sourceId,
          studyShortCode: spec.studyShortCode,
          subjectName: spec.subjectName,
          specimenTypeName: spec.specimenTypeName,
          collectionDate: spec.collectionDate,
        }, dbInstance)
        if (!validation.valid || !validation.resolved) {
          errors.push({ index: i, message: validation.error || 'Invalid specimen data' })
          continue
        }
        let collectionId: number | null = null
        let collectionKey: string | undefined
        if (spec.container?.containerType) {
          const containerType = spec.container.containerType
          const containerTypeValidation = await validateContainerTypeForSpecimenType(dbInstance, validation.resolved.specimenTypeId, containerType)
          if (!containerTypeValidation.valid) {
            errors.push({ index: i, message: containerTypeValidation.error || 'Invalid container type for specimen type' })
            continue
          }
          const containerDataForValidation: ContainerData = {
            containerType,
            collectionName: spec.container.collectionName,
            collectionBarcode: spec.container.collectionBarcode,
            barcode: spec.container.barcode,
            position: spec.container.position,
            label: spec.container.label,
          }
          const containerValidation = await validateContainerData(dbInstance, containerType, containerDataForValidation)
          if (!containerValidation.valid) {
            errors.push({ index: i, message: containerValidation.error || 'Invalid container data' })
            continue
          }
          const collectionType = containerType === 'cryovial_tube' ? 'cryovial_box' : containerType === 'paper' ? 'box' : 'micronix_plate'
          const identifier = spec.container.collectionName || spec.container.collectionBarcode
          if (containerType !== 'paper' && identifier) {
            const existingId = await resolveCollection(identifier, collectionType, dbInstance)
            if (!existingId && !spec.container.collectionLocationId) {
              errors.push({ index: i, message: `Collection '${identifier}' not found. Create it first or use Combined import with a location.` })
              continue
            }
            collectionId = existingId
            collectionKey = `${collectionType}-${identifier}`
          }
          if (containerType === 'paper' && spec.container.collectionName) {
            const existingBox = await resolveCollection(spec.container.collectionName, 'box', dbInstance)
            if (!existingBox && !spec.container.collectionLocationId) {
              errors.push({ index: i, message: `Box '${spec.container.collectionName}' not found. Create it first or use Combined import with a location.` })
              continue
            }
            collectionId = existingBox
            collectionKey = `box-${spec.container.collectionName}`
          }
          validRows.push({ index: i, spec, validation: validation as ValidRow['validation'], collectionId: collectionId ?? undefined, collectionKey, containerType })
        } else {
          validRows.push({ index: i, spec, validation: validation as ValidRow['validation'] })
        }
      } catch (error: unknown) {
        errors.push({ index: i, message: error instanceof Error ? error.message : 'Validation failed' })
      }
    }

    const seenBarcodes = new Set<string>()
    const seenPositionByCollection = new Map<string, Set<string>>()
    for (const row of validRows) {
      if (!row.containerType || !row.spec.container?.containerType) continue
      const i = row.index
      const container = row.spec.container
      const containerType = row.containerType
      const collectionId = row.collectionId ?? null
      const collectionKey = row.collectionKey ?? `unknown-${i}`
      const normalizedPosition = normalizePosition(container.position)
      const barcode = container.barcode?.trim() || null

      if (containerType === 'micronix_tube' || containerType === 'cryovial_tube') {
        if (barcode) {
          if (seenBarcodes.has(barcode)) {
            errors.push({ index: i, message: `Barcode '${barcode}' is used more than once in your file. Each barcode must be unique.` })
          }
          seenBarcodes.add(barcode)
        }
      }

      if (normalizedPosition && (containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') && collectionId !== null) {
        if (containerType === 'micronix_tube' || containerType === 'static_well') {
          const existingTube = await dbInstance.select({ id: micronixTube.id }).from(micronixTube).where(and(eq(micronixTube.collectionId, collectionId), eq(micronixTube.position, normalizedPosition))).get()
          const existingWell = containerType === 'static_well' ? await dbInstance.select({ id: staticWell.id }).from(staticWell).where(and(eq(staticWell.collectionId, collectionId), eq(staticWell.position, normalizedPosition))).get() : null
          if (existingTube || existingWell) {
            errors.push({ index: i, message: `Position ${normalizedPosition} is already used in this plate. Use a different position or plate.` })
          }
        } else {
          const existing = await dbInstance.select({ id: cryovialTube.id }).from(cryovialTube).where(and(eq(cryovialTube.collectionId, collectionId), eq(cryovialTube.position, normalizedPosition))).get()
          if (existing) {
            errors.push({ index: i, message: `Position ${normalizedPosition} is already used in this box. Use a different position or box.` })
          }
        }
        let positionSet = seenPositionByCollection.get(collectionKey)
        if (!positionSet) {
          positionSet = new Set()
          seenPositionByCollection.set(collectionKey, positionSet)
        }
        if (positionSet.has(normalizedPosition)) {
          errors.push({ index: i, message: `Position ${normalizedPosition} in this plate/box is used more than once in your file. Each position can only be used once.` })
        }
        positionSet.add(normalizedPosition)
      }
    }

    return c.json({ valid: errors.length === 0, errors })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return specimens
}
