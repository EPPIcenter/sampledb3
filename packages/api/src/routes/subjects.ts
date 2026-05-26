import { Hono } from 'hono'
import type { Database } from '../db/client'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { 
  studySubject, 
  study, 
  specimen, 
  specimenType, 
  storageContainer,
  unit,
  qpcrExperiment,
  qpcrExperimentWell,
  qpcrRun,
  qpcrWellResult,
} from '../db/schema'
import { eq, sql, and, inArray, or, isNull } from 'drizzle-orm'
import { validatePage, validateLimit } from '../lib/constants'
import { z } from 'zod'
import { resolveStudyByShortCode, resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from '../lib/identifier-resolution'
import { validateSubjectName, validateStudyShortCode, validateSpecimenData, validateCollectionDate, validateContainerTypeForSpecimenType, validateUnitForContainerType } from '../lib/validation'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from '../lib/defaults'
import { resolveCollection } from '../lib/collection-resolution'
import { resolveCollectionByName } from '../lib/collection-resolution'
import { findExistingStudySpecimen } from '../lib/specimen-helpers'
import { handleRouteError, NotFoundError, ValidationError } from '../lib/error-handler'
import { utcNow } from '../lib/datetime'
import { requireParam } from '../lib/common-validators'
import {
  runOneSubjectWithSpecimens,
  formatOneSubjectWithSpecimensResponse,
  type ExtendedContainerData,
} from '../lib/bulk-combined-import'
import { withSpecimensRequestSchema } from '../lib/schemas'
import { mergeSubjects } from '../lib/subjects/merge'
import {
  buildSpecimenSummaryData,
  emptySpecimenCollectionSummary,
} from '../lib/container-enrichment'

/**
 * Create subjects routes with database injection
 * @param database - Database instance (required)
 */
export function createSubjectsRoutes(database: Database): Hono {
  const dbInstance = database
  const subjects = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

// List all subjects (for counting)
subjects.get('/', authMiddleware, async (c) => {
  try {
    const page = validatePage(c.req.query('page'))
    const limit = await validateLimit(dbInstance, c.req.query('limit'))
    const offset = (page - 1) * limit
    
    const [subjectsList, countResult] = await Promise.all([
      dbInstance.select().from(studySubject).limit(limit).offset(offset),
      dbInstance.select({ count: sql<number>`COUNT(*)`.as('count') }).from(studySubject),
    ])
    
    const total = countResult[0]?.count || 0
    
    return c.json({
      subjects: subjectsList,
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

// Get subject by ID
subjects.get('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid subject ID' }, 400)
    }

    const subject = await dbInstance
      .select({
        id: studySubject.id,
        studyId: studySubject.studyId,
        name: studySubject.name,
        created: studySubject.created,
        lastUpdated: studySubject.lastUpdated,
        study: {
          id: study.id,
          title: study.title,
          shortCode: study.shortCode,
        },
      })
      .from(studySubject)
      .leftJoin(study, eq(studySubject.studyId, study.id))
      .where(eq(studySubject.id, id))
      .get()

    if (!subject) {
      throw new NotFoundError('Subject', id)
    }

    return c.json({ subject })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get subject summary with enriched specimen data
subjects.get('/:id/summary', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid subject ID' }, 400)
    }

    // Get subject
    const subject = await dbInstance
      .select({
        id: studySubject.id,
        studyId: studySubject.studyId,
        name: studySubject.name,
        created: studySubject.created,
        lastUpdated: studySubject.lastUpdated,
        study: {
          id: study.id,
          title: study.title,
          shortCode: study.shortCode,
        },
      })
      .from(studySubject)
      .leftJoin(study, eq(studySubject.studyId, study.id))
      .where(eq(studySubject.id, id))
      .get()

    if (!subject) {
      throw new NotFoundError('Subject', id)
    }

    // Get all specimens for this subject
    const specimens = await dbInstance
      .select({
        id: specimen.id,
        studySubjectId: specimen.studySubjectId,
        controlBatchId: specimen.controlBatchId,
        specimenTypeId: specimen.specimenTypeId,
        collectionDate: specimen.collectionDate,
        created: specimen.created,
        lastUpdated: specimen.lastUpdated,
      })
      .from(specimen)
      .where(eq(specimen.studySubjectId, id))

    if (specimens.length === 0) {
      return c.json({
        subject,
        specimens: [],
        summary: emptySpecimenCollectionSummary(),
      })
    }

    const specimenIds = specimens.map(s => s.id)
    const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]
    const specimenTypes = await dbInstance
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))
    const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

    const containers = await dbInstance
      .select({
        id: storageContainer.id,
        specimenId: storageContainer.specimenId,
        comment: storageContainer.comment,
        totalQuantity: storageContainer.totalQuantity,
        remainingQuantity: storageContainer.remainingQuantity,
        unitSymbol: unit.symbol,
      })
      .from(storageContainer)
      .leftJoin(unit, eq(storageContainer.unitId, unit.id))
      .where(inArray(storageContainer.specimenId, specimenIds))

    const { enrichedSpecimens, summary } = await buildSpecimenSummaryData(
      dbInstance,
      specimens,
      containers,
      specimenTypeMap,
      { includeComment: true },
    )

    return c.json({
      subject,
      specimens: enrichedSpecimens,
      summary,
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get qPCR result summary for this subject (wells linked via specimen)
subjects.get('/:id/qpcr-results', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid subject ID' }, 400)
    const subjectRow = await dbInstance.select().from(studySubject).where(eq(studySubject.id, id)).get()
    if (!subjectRow) return c.json({ error: 'Not found' }, 404)
    const specimens = await dbInstance.select({ id: specimen.id }).from(specimen).where(eq(specimen.studySubjectId, id))
    const specimenIds = specimens.map((s) => s.id)
    if (specimenIds.length === 0) return c.json({ results: [] })
    const wells = await dbInstance
      .select({
        qpcrExperimentId: qpcrExperimentWell.qpcrExperimentId,
        wellPosition: qpcrExperimentWell.wellPosition,
        specimenId: qpcrExperimentWell.specimenId,
      })
      .from(qpcrExperimentWell)
      .where(inArray(qpcrExperimentWell.specimenId, specimenIds))
    if (wells.length === 0) return c.json({ results: [] })
    const experimentIds = [...new Set(wells.map((w) => w.qpcrExperimentId))]
    const runs = await dbInstance
      .select({ id: qpcrRun.id, qpcrExperimentId: qpcrRun.qpcrExperimentId, runStartedAt: qpcrRun.runStartedAt, fileName: qpcrRun.fileName })
      .from(qpcrRun)
      .where(inArray(qpcrRun.qpcrExperimentId, experimentIds))
    const runIds = runs.map((r) => r.id)
    if (runIds.length === 0) return c.json({ results: [] })
    const wellResults = await dbInstance
      .select({
        id: qpcrWellResult.id,
        qpcrRunId: qpcrWellResult.qpcrRunId,
        wellPosition: qpcrWellResult.wellPosition,
        targetName: qpcrWellResult.targetName,
        cq: qpcrWellResult.cq,
        quantity: qpcrWellResult.quantity,
      })
      .from(qpcrWellResult)
      .where(inArray(qpcrWellResult.qpcrRunId, runIds))
    const runMap = new Map(runs.map((r) => [r.id, r]))
    const expMap = new Map<string, boolean>()
    wells.forEach((w) => expMap.set(`${w.qpcrExperimentId}\t${w.wellPosition}`, true))
    const experiments = await dbInstance
      .select({ id: qpcrExperiment.id, name: qpcrExperiment.name })
      .from(qpcrExperiment)
      .where(inArray(qpcrExperiment.id, experimentIds))
    const expNameMap = new Map(experiments.map((e) => [e.id, e.name]))
    const results = wellResults
      .filter((wr) => {
        const run = runMap.get(wr.qpcrRunId)
        return run && expMap.has(`${run.qpcrExperimentId}\t${wr.wellPosition}`)
      })
      .map((wr) => {
        const run = runMap.get(wr.qpcrRunId)!
        return {
          experimentId: run.qpcrExperimentId,
          experimentName: expNameMap.get(run.qpcrExperimentId) ?? null,
          runId: run.id,
          runStartedAt: run.runStartedAt,
          fileName: run.fileName,
          wellPosition: wr.wellPosition,
          targetName: wr.targetName,
          cq: wr.cq,
          quantity: wr.quantity,
        }
      })
    return c.json({ results })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create single subject
subjects.post('/', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      studyId: z.number().int().optional(),
      studyShortCode: z.string().optional(),
      name: z.string().min(1),
    })
    
    const data = schema.parse(body)
    
    // Resolve study ID
    let studyId: number
    if (data.studyId) {
      studyId = data.studyId
    } else if (data.studyShortCode) {
      const resolved = await resolveStudyByShortCode(dbInstance, data.studyShortCode)
      if (!resolved) {
        throw new NotFoundError(`Study with short code '${data.studyShortCode}'`)
      }
      studyId = resolved
    } else {
      return c.json({ error: 'Either studyId or studyShortCode is required' }, 400)
    }
    
    // Validate subject name
    const nameValidation = await validateSubjectName(dbInstance, studyId, data.name)
    if (!nameValidation.valid) {
      return c.json({ error: nameValidation.error }, 400)
    }
    
    const trimmedName = data.name.trim()
    const now = utcNow()
    const user = c.get('user')
    
    const [newSubject] = await dbInstance
      .insert(studySubject)
      .values({
        studyId,
        name: trimmedName,
        created: now,
        lastUpdated: now,
        createdBy: user?.id,
        updatedBy: user?.id,
      })
      .returning()
    
    return c.json({ subject: newSubject }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create multiple subjects (bulk)
subjects.post('/bulk', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      subjects: z.array(z.object({
        studyShortCode: z.string().min(1),
        name: z.string().min(1),
      })),
    })
    
    const data = schema.parse(body)
    
    if (data.subjects.length === 0) {
      return c.json({ error: 'No subjects provided' }, 400)
    }
    
    const errors: Array<{ index: number; error: string }> = []
    const validSubjects: Array<{ studyId: number; name: string }> = []
    
    // Validate all subjects first
    for (let i = 0; i < data.subjects.length; i++) {
      const subject = data.subjects[i]
      const trimmedName = subject.name.trim()
      
      // Validate study short code
      const studyValidation = await validateStudyShortCode(dbInstance, subject.studyShortCode)
      if (!studyValidation.valid || !studyValidation.studyId) {
        errors.push({
          index: i,
          error: studyValidation.error || 'Invalid study',
        })
        continue
      }
      
      // Validate subject name
      const nameValidation = await validateSubjectName(dbInstance, studyValidation.studyId, trimmedName)
      if (!nameValidation.valid) {
        errors.push({
          index: i,
          error: nameValidation.error || 'Invalid subject name',
        })
        continue
      }
      
      validSubjects.push({
        studyId: studyValidation.studyId,
        name: trimmedName,
      })
    }
    
    // If there are validation errors, return them
    if (errors.length > 0) {
      return c.json({
        error: 'Validation failed',
        errors,
        created: 0,
      }, 400)
    }
    
    // Check for duplicates within the batch
    const seen = new Set<string>()
    const duplicateErrors: Array<{ index: number; error: string }> = []
    
    for (let i = 0; i < validSubjects.length; i++) {
      const key = `${validSubjects[i].studyId}:${validSubjects[i].name}`
      if (seen.has(key)) {
        duplicateErrors.push({
          index: i,
          error: `Duplicate subject name '${validSubjects[i].name}' in study`,
        })
      }
      seen.add(key)
    }
    
    if (duplicateErrors.length > 0) {
      return c.json({
        error: 'Duplicate subjects found in batch',
        errors: duplicateErrors,
        created: 0,
      }, 400)
    }
    
    // Insert all subjects in a single transaction (all-or-nothing)
    const now = utcNow()
    const user = c.get('user')
    const insertedSubjects = await dbInstance.transaction((tx) => {
      const out: typeof studySubject.$inferSelect[] = []
      for (const subject of validSubjects) {
        const result = tx
          .insert(studySubject)
          .values({
            studyId: subject.studyId,
            name: subject.name,
            created: now,
            lastUpdated: now,
            createdBy: user?.id,
            updatedBy: user?.id,
          })
          .returning()
          .get()
        const newSubject = Array.isArray(result) ? result[0] : result
        out.push(newSubject as typeof studySubject.$inferSelect)
      }
      return out
    })

    return c.json({
      subjects: insertedSubjects,
      created: insertedSubjects.length,
    }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Validate bulk subjects without creating (same body as POST /subjects/bulk)
subjects.post('/bulk/validate', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      subjects: z.array(z.object({
        studyShortCode: z.string().min(1),
        name: z.string().min(1),
      })),
    })
    const data = schema.parse(body)
    if (data.subjects.length === 0) {
      return c.json({ error: 'No subjects provided' }, 400)
    }
    const errors: Array<{ index: number; message: string }> = []
    const validSubjects: Array<{ studyId: number; name: string }> = []
    for (let i = 0; i < data.subjects.length; i++) {
      const subject = data.subjects[i]
      const trimmedName = subject.name.trim()
      const studyValidation = await validateStudyShortCode(dbInstance, subject.studyShortCode)
      if (!studyValidation.valid || !studyValidation.studyId) {
        errors.push({ index: i, message: studyValidation.error || 'Invalid study' })
        continue
      }
      const nameValidation = await validateSubjectName(dbInstance, studyValidation.studyId, trimmedName)
      if (!nameValidation.valid) {
        errors.push({ index: i, message: nameValidation.error || 'Invalid subject name' })
        continue
      }
      validSubjects.push({ studyId: studyValidation.studyId, name: trimmedName })
    }
    const seen = new Set<string>()
    for (let i = 0; i < validSubjects.length; i++) {
      const key = `${validSubjects[i].studyId}:${validSubjects[i].name}`
      if (seen.has(key)) {
        errors.push({ index: i, message: `Duplicate subject name '${validSubjects[i].name}' in study` })
      }
      seen.add(key)
    }
    return c.json({ valid: errors.length === 0, errors })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create subject with specimens atomically (delegates to bulk-combined-import)
subjects.post('/with-specimens', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const data = withSpecimensRequestSchema.parse(body)
    const user = c.get('user')
    const result = await runOneSubjectWithSpecimens(
      dbInstance,
      {
        studyShortCode: data.studyShortCode,
        subjectName: data.subjectName,
        specimens: data.specimens.map((sp) => ({
          specimenTypeName: sp.specimenTypeName,
          collectionDate: sp.collectionDate,
          container: sp.container as ExtendedContainerData | undefined,
        })),
      },
      user?.id
    )
    return c.json(formatOneSubjectWithSpecimensResponse(result), 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    if (error instanceof ValidationError) {
      const payload: { error: string; specimenIndex?: number } = { error: error.message }
      if (error.details?.specimenIndex !== undefined) {
        payload.specimenIndex = error.details.specimenIndex
      }
      return c.json(payload, 400)
    }
    return handleRouteError(error, c)
  }
})

// Merge subjects endpoint
subjects.post('/:targetId/merge', memberMiddleware, async (c) => {
  try {
    const targetId = parseInt(requireParam(c, 'targetId'))
    if (isNaN(targetId)) {
      return c.json({ error: 'Invalid target subject ID' }, 400)
    }

    const body = await c.req.json()
    const data = z.object({ sourceId: z.number().int().positive() }).parse(body)
    const user = c.get('user')
    const result = await mergeSubjects(dbInstance, targetId, data.sourceId, user?.id)

    return c.json({
      success: true,
      specimensTransferred: result.specimensTransferred,
      specimensMerged: result.specimensMerged,
      containersMerged: result.containersMerged,
      totalContainersTransferred: result.totalContainersTransferred,
      targetSubject: result.targetSubject,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return handleRouteError(error, c)
  }
})

// Update subject
subjects.put('/:id', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid subject ID' }, 400)
    }

    // Check if subject exists
    const existingSubject = await dbInstance
      .select()
      .from(studySubject)
      .where(eq(studySubject.id, id))
      .get()

    if (!existingSubject) {
      throw new NotFoundError('Subject', id)
    }

    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
    })
    
    const data = schema.parse(body)
    const trimmedName = data.name.trim()
    
    // Validate name length
    if (trimmedName.length === 0) {
      return c.json({ error: 'Subject name cannot be empty' }, 400)
    }
    
    if (trimmedName.length > 255) {
      return c.json({ error: 'Subject name cannot exceed 255 characters' }, 400)
    }
    
      // Check for duplicate name within the same study (excluding current subject)
      if (trimmedName !== existingSubject.name) {
        const duplicate = await dbInstance
        .select({ id: studySubject.id })
        .from(studySubject)
        .where(and(
          eq(studySubject.studyId, existingSubject.studyId),
          eq(studySubject.name, trimmedName)
        ) as any)
        .get()
      
      if (duplicate) {
        return c.json({ error: `Subject name '${trimmedName}' already exists in this study` }, 400)
      }
    }
    
    // Update subject
    const user = c.get('user')
    const [updatedSubject] = await dbInstance
      .update(studySubject)
      .set({
        name: trimmedName,
        lastUpdated: utcNow(),
        updatedBy: user?.id,
      })
      .where(eq(studySubject.id, id))
      .returning()
    
    return c.json({ subject: updatedSubject })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return subjects
}
