import { Hono } from 'hono'
import type { Database } from '../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { 
  study, 
  studySubject, 
  specimen, 
  specimenType, 
  storageContainer,
  storageContainerTag,
  containerDerivation,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, like, sql, or, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { validatePage, validateLimit } from '../lib/constants'
import { handleRouteError, NotFoundError, ConflictError, ValidationError } from '../lib/error-handler'
import { createAuthMiddleware, createMemberMiddleware, createAdminMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'

/** Short code prefix for tutorial namespace. Any study whose short code starts with this (case-insensitive) may be deleted by any authenticated user. */
const TUTORIAL_SHORT_CODE_PREFIX = 'TUT'

/**
 * Create studies routes with database injection
 * @param database - Database instance (required)
 * @param sqliteDatabase - Raw SQLite database instance (required for raw queries)
 */
export function createStudiesRoutes(database: Database, sqliteDatabase: SQLiteDatabase): Hono {
  const studies = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)

// List all studies
studies.get('/', authMiddleware, async (c) => {
  try {
    const search = c.req.query('search')
    const page = validatePage(c.req.query('page'))
    const limit = await validateLimit(database, c.req.query('limit'))
    const offset = (page - 1) * limit
    
    let query = database.select().from(study)
    let countQuery = database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(study)
    
    if (search) {
      const searchPattern = `%${search}%`
      const whereClause = sql`${study.title} LIKE ${searchPattern} OR ${study.shortCode} LIKE ${searchPattern}`
      query = query.where(whereClause) as any
      countQuery = countQuery.where(whereClause) as any
    }
    
    const [studiesList, countResult] = await Promise.all([
      query.limit(limit).offset(offset),
      countQuery,
    ])
    
    const total = countResult[0]?.count || 0
    
    return c.json({
      studies: studiesList,
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

// Get batch summaries for multiple studies (lightweight version)
// NOTE: This must come before /:id route to avoid matching "summaries" as an ID
studies.get('/summaries', authMiddleware, async (c) => {
  try {
    const idsParam = c.req.query('ids')
    if (!idsParam) {
      return c.json({ error: 'ids parameter is required' }, 400)
    }

    const ids = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    if (ids.length === 0) {
      return c.json({ summaries: [] })
    }

    // Get all subjects for these studies
    const subjects = await database
      .select()
      .from(studySubject)
      .where(inArray(studySubject.studyId, ids))

    const studySubjectMap = new Map<number, number[]>()
    subjects.forEach(s => {
      if (!studySubjectMap.has(s.studyId)) {
        studySubjectMap.set(s.studyId, [])
      }
      studySubjectMap.get(s.studyId)!.push(s.id)
    })

    const allSubjectIds = subjects.map(s => s.id)
    const summaries: Array<{
      studyId: number
      totalSubjects: number
      totalSpecimens: number
      totalContainers: number
      collectionDateRange: { earliest: string; latest: string } | null
    }> = []

    if (allSubjectIds.length === 0) {
      // No subjects for any study
      for (const id of ids) {
        summaries.push({
          studyId: id,
          totalSubjects: 0,
          totalSpecimens: 0,
          totalContainers: 0,
          collectionDateRange: null,
        })
      }
      return c.json({ summaries })
    }

    // Get all specimens for these subjects - batch to avoid SQLite variable limit
    const SQLITE_MAX_VARS = 500 // Conservative limit to avoid issues
    const specimens: Array<{
      id: number
      studySubjectId: number
      collectionDate: string | null
    }> = []

    for (let i = 0; i < allSubjectIds.length; i += SQLITE_MAX_VARS) {
      const batch = allSubjectIds.slice(i, i + SQLITE_MAX_VARS)
      const placeholders = batch.map(() => '?').join(',')
      const specimensQuery = `
        SELECT 
          s.id,
          s.study_subject_id as studySubjectId,
          s.collection_date as collectionDate
        FROM specimen s
        WHERE s.study_subject_id IN (${placeholders})
      `
      const stmt = sqliteDatabase.prepare(specimensQuery)
      const batchResults = stmt.all(...batch) as Array<{
        id: number
        studySubjectId: number
        collectionDate: string | null
      }>
      specimens.push(...batchResults)
    }

    // Map specimens to studies via subjects
    const subjectToStudyMap = new Map<number, number>()
    subjects.forEach(s => {
      subjectToStudyMap.set(s.id, s.studyId)
    })

    const studySpecimenMap = new Map<number, Array<{ id: number; collectionDate: string | null }>>()
    specimens.forEach(spec => {
      const studyId = subjectToStudyMap.get(spec.studySubjectId)
      if (studyId) {
        if (!studySpecimenMap.has(studyId)) {
          studySpecimenMap.set(studyId, [])
        }
        studySpecimenMap.get(studyId)!.push({ id: spec.id, collectionDate: spec.collectionDate })
      }
    })

    // Get container counts - batch to avoid SQLite variable limit
    const specimenIds = specimens.map(s => s.id)
    const containerCounts: Record<number, number> = {}
    if (specimenIds.length > 0) {
      // Map containers back to studies
      const specimenToStudyMap = new Map<number, number>()
      specimens.forEach(spec => {
        const studyId = subjectToStudyMap.get(spec.studySubjectId)
        if (studyId) {
          specimenToStudyMap.set(spec.id, studyId)
        }
      })

      // Batch container queries
      for (let i = 0; i < specimenIds.length; i += SQLITE_MAX_VARS) {
        const batch = specimenIds.slice(i, i + SQLITE_MAX_VARS)
        const containerPlaceholders = batch.map(() => '?').join(',')
        const containersQuery = `
          SELECT specimen_id, COUNT(*) as count
          FROM storage_container
          WHERE specimen_id IN (${containerPlaceholders})
          GROUP BY specimen_id
        `
        const containerStmt = sqliteDatabase.prepare(containersQuery)
        const containerRows = containerStmt.all(...batch) as Array<{ specimen_id: number; count: number }>

        containerRows.forEach(row => {
          const studyId = specimenToStudyMap.get(row.specimen_id)
          if (studyId) {
            containerCounts[studyId] = (containerCounts[studyId] || 0) + row.count
          }
        })
      }
    }

    // Build summaries for each study
    for (const id of ids) {
      const subjectIds = studySubjectMap.get(id) || []
      const studySpecimens = studySpecimenMap.get(id) || []
      const totalSpecimens = studySpecimens.length
      const totalContainers = containerCounts[id] || 0

      // Calculate collection date range
      const collectionDates = (studySpecimens
        .map(s => s.collectionDate)
        .filter(Boolean) as string[])
        .sort()

      const collectionDateRange = collectionDates.length > 0
        ? {
            earliest: collectionDates[0],
            latest: collectionDates[collectionDates.length - 1],
          }
        : null

      summaries.push({
        studyId: id,
        totalSubjects: subjectIds.length,
        totalSpecimens,
        totalContainers,
        collectionDateRange,
      })
    }

    return c.json({ summaries })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get study by ID
studies.get('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid study ID' }, 400)
    }

    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.id, id))
      .get()

    if (!studyRecord) {
      throw new NotFoundError('Study', id)
    }

    return c.json({ study: studyRecord })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get subjects for a study
studies.get('/:id/subjects', authMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid study ID' }, 400)
    }

    const pageParam = c.req.query('page')
    const limitParam = c.req.query('limit')
    
    // If no pagination params provided, return all subjects (for client-side pagination)
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

    const whereClause = eq(studySubject.studyId, id)
    
    // Get all subjects or paginated subset
    let query = database
      .select({
        id: studySubject.id,
        studyId: studySubject.studyId,
        name: studySubject.name,
        created: studySubject.created,
        lastUpdated: studySubject.lastUpdated,
      })
      .from(studySubject)
      .where(whereClause)
    
    if (!returnAll) {
      query = query.limit(limit!).offset(offset!) as any
    }
    
    const subjectsList = await query

    // Get total count for pagination info (even when returning all)
    const countResult = await database
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(studySubject)
      .where(whereClause)

    const total = countResult[0]?.count || 0

    // Get specimen counts for all subjects using a batch query
    const subjectIds = subjectsList.map(s => s.id)
    const specimenCounts: Record<number, number> = {}
    
    if (subjectIds.length > 0) {
      // Count specimens using the new schema
      const placeholders = subjectIds.map(() => '?').join(',')
      const query = `
        SELECT 
          s.study_subject_id as subject_id,
          COUNT(*) as count
        FROM specimen s
        WHERE s.study_subject_id IN (${placeholders})
        GROUP BY s.study_subject_id
      `
      
      // Use the underlying Bun SQLite database for this query
      const stmt = sqliteDatabase.prepare(query)
      const rows = stmt.all(...subjectIds) as Array<{ subject_id: number; count: number }>

      rows.forEach(row => {
        specimenCounts[row.subject_id] = row.count
      })
    }

    // Combine subjects with their counts
    const subjectsWithCounts = subjectsList.map(subject => ({
      ...subject,
      specimenCount: specimenCounts[subject.id] || 0,
    }))

    return c.json({
      subjects: subjectsWithCounts,
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

// Get study summary
studies.get('/:id/summary', authMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid study ID' }, 400)
    }

    // Get study
    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.id, id))
      .get()

    if (!studyRecord) {
      return c.json({ error: 'Study not found' }, 404)
    }

    // Get all subjects for this study
    const subjects = await database
      .select()
      .from(studySubject)
      .where(eq(studySubject.studyId, id))

    const subjectIds = subjects.map(s => s.id)
    const totalSubjects = subjects.length

    if (subjectIds.length === 0) {
      return c.json({
        study: studyRecord,
        summary: {
          totalSubjects: 0,
          totalSpecimens: 0,
          totalContainers: 0,
          averageSpecimensPerSubject: 0,
          specimenTypes: [],
          containerTypes: {},
          collectionDateRange: null,
          studyDurationDays: null,
          collectionTimeline: [],
          enrollmentTimeline: [],
        },
      })
    }

    // Get all specimens for these subjects
    const placeholders = subjectIds.map(() => '?').join(',')
    const specimensQuery = `
      SELECT 
        s.id,
        s.study_subject_id as studySubjectId,
        s.specimen_type_id as specimenTypeId,
        s.collection_date as collectionDate,
        s.created,
        s.last_updated as lastUpdated
      FROM specimen s
      WHERE s.study_subject_id IN (${placeholders})
    `
    const stmt = sqliteDatabase.prepare(specimensQuery)
    const specimens = stmt.all(...subjectIds) as Array<{
      id: number
      studySubjectId: number
      specimenTypeId: number
      collectionDate: string | null
      created: string
      lastUpdated: string
    }>

    const totalSpecimens = specimens.length

    if (specimens.length === 0) {
      // Calculate enrollment timeline from subjects
      const enrollmentTimeline = subjects
        .map(s => ({
          date: s.created.split('T')[0], // Just the date part
          count: 1,
        }))
        .reduce((acc, item) => {
          const existing = acc.find(x => x.date === item.date)
          if (existing) {
            existing.count += item.count
          } else {
            acc.push(item)
          }
          return acc
        }, [] as Array<{ date: string; count: number }>)
        .sort((a, b) => a.date.localeCompare(b.date))

      return c.json({
        study: studyRecord,
        summary: {
          totalSubjects,
          totalSpecimens: 0,
          totalContainers: 0,
          averageSpecimensPerSubject: 0,
          specimenTypes: [],
          containerTypes: {},
          collectionDateRange: null,
          studyDurationDays: null,
          collectionTimeline: [],
          enrollmentTimeline,
        },
      })
    }

    const specimenIds = specimens.map(s => s.id)
    const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]

    // Get specimen types
    const specimenTypes = await database
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))

    const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

    // Get all containers for these specimens
    const containers = await database
      .select()
      .from(storageContainer)
      .where(inArray(storageContainer.specimenId, specimenIds))

    const totalContainers = containers.length
    const containerIds = containers.map(c => c.id)

    // Get container type information
    const [micronixTubes, cryovialTubes, papers, staticWells] = await Promise.all([
      containerIds.length > 0
        ? database.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.id, containerIds))
        : [],
      containerIds.length > 0
        ? database.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.id, containerIds))
        : [],
      containerIds.length > 0
        ? database.select({ id: paper.id }).from(paper).where(inArray(paper.id, containerIds))
        : [],
      containerIds.length > 0
        ? database.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.id, containerIds))
        : [],
    ])

    // Create container type map
    const containerTypeMap = new Map<number, string>()
    micronixTubes.forEach(t => containerTypeMap.set(t.id, 'micronix_tube'))
    cryovialTubes.forEach(t => containerTypeMap.set(t.id, 'cryovial_tube'))
    papers.forEach(t => containerTypeMap.set(t.id, 'paper'))
    staticWells.forEach(t => containerTypeMap.set(t.id, 'static_well'))

    // Container type breakdown
    const containerTypeCounts: Record<string, number> = {}
    containers.forEach(container => {
      const type = containerTypeMap.get(container.id) || 'unknown'
      containerTypeCounts[type] = (containerTypeCounts[type] || 0) + 1
    })

    // Specimen type breakdown
    const specimenTypeCounts: Record<string, number> = {}
    specimens.forEach(spec => {
      const typeName = specimenTypeMap.get(spec.specimenTypeId) || 'Unknown'
      specimenTypeCounts[typeName] = (specimenTypeCounts[typeName] || 0) + 1
    })

    const specimenTypesArray = Object.entries(specimenTypeCounts).map(([name, count]) => ({
      name,
      count,
      percentage: totalSpecimens > 0 ? (count / totalSpecimens) * 100 : 0,
    }))

    // Collection date range
    const collectionDates = (specimens
      .map(s => s.collectionDate)
      .filter(Boolean) as string[])
      .sort()

    const collectionDateRange = collectionDates.length > 0
      ? {
          earliest: collectionDates[0],
          latest: collectionDates[collectionDates.length - 1],
        }
      : null

    // Study duration in days
    const studyDurationDays = collectionDateRange
      ? Math.ceil(
          (new Date(collectionDateRange.latest).getTime() -
            new Date(collectionDateRange.earliest).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null

    // Collection timeline (daily counts)
    const collectionTimeline = collectionDates.reduce((acc, date) => {
      const dateOnly = date.split('T')[0]
      const existing = acc.find(x => x.date === dateOnly)
      if (existing) {
        existing.count += 1
      } else {
        acc.push({ date: dateOnly, count: 1 })
      }
      return acc
    }, [] as Array<{ date: string; count: number }>)
      .sort((a, b) => a.date.localeCompare(b.date))

    // Enrollment timeline (daily counts)
    const enrollmentTimeline = subjects
      .map(s => ({
        date: s.created.split('T')[0],
        count: 1,
      }))
      .reduce((acc, item) => {
        const existing = acc.find(x => x.date === item.date)
        if (existing) {
          existing.count += item.count
        } else {
          acc.push(item)
        }
        return acc
      }, [] as Array<{ date: string; count: number }>)
      .sort((a, b) => a.date.localeCompare(b.date))

    return c.json({
      study: studyRecord,
      summary: {
        totalSubjects,
        totalSpecimens,
        totalContainers,
        averageSpecimensPerSubject: totalSubjects > 0 ? totalSpecimens / totalSubjects : 0,
        specimenTypes: specimenTypesArray,
        containerTypes: containerTypeCounts,
        collectionDateRange,
        studyDurationDays,
        collectionTimeline,
        enrollmentTimeline,
      },
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get study timeline data
studies.get('/:id/timeline', authMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid study ID' }, 400)
    }

    // Get study
    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.id, id))
      .get()

    if (!studyRecord) {
      throw new NotFoundError('Study', id)
    }

    // Get all subjects for this study, sorted by name
    const subjects = await database
      .select()
      .from(studySubject)
      .where(eq(studySubject.studyId, id))
      .orderBy(studySubject.name)

    const subjectIds = subjects.map(s => s.id)

    if (subjectIds.length === 0) {
      return c.json({
        subjects: [],
        specimenTypes: [],
        dateRange: null,
      })
    }

    // Get all specimens for these subjects with collection dates
    const placeholders = subjectIds.map(() => '?').join(',')
    const specimensQuery = `
      SELECT 
        s.id,
        s.study_subject_id as studySubjectId,
        s.specimen_type_id as specimenTypeId,
        s.collection_date as collectionDate
      FROM specimen s
      WHERE s.study_subject_id IN (${placeholders})
      ORDER BY s.collection_date
    `
    const stmt = sqliteDatabase.prepare(specimensQuery)
    const specimens = stmt.all(...subjectIds) as Array<{
      id: number
      studySubjectId: number
      specimenTypeId: number
      collectionDate: string
    }>

    if (specimens.length === 0) {
      return c.json({
        subjects: subjects.map(s => ({ id: s.id, name: s.name, specimens: [] })),
        specimenTypes: [],
        dateRange: null,
      })
    }

    const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]

    // Get specimen types
    const specimenTypes = await database
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))

    const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

    // Group specimens by subject
    const specimensBySubject = new Map<number, Array<{
      id: number
      collectionDate: string
      specimenTypeId: number
      specimenTypeName: string
    }>>()

    specimens.forEach(spec => {
      if (!specimensBySubject.has(spec.studySubjectId)) {
        specimensBySubject.set(spec.studySubjectId, [])
      }
      specimensBySubject.get(spec.studySubjectId)!.push({
        id: spec.id,
        collectionDate: spec.collectionDate,
        specimenTypeId: spec.specimenTypeId,
        specimenTypeName: specimenTypeMap.get(spec.specimenTypeId) || 'Unknown',
      })
    })

    // Build subjects array with their specimens
    const subjectsWithSpecimens = subjects.map(subject => ({
      id: subject.id,
      name: subject.name,
      specimens: specimensBySubject.get(subject.id) || [],
    }))

    // Calculate date range
    const collectionDates = specimens.map(s => s.collectionDate).sort()
    const dateRange = collectionDates.length > 0
      ? {
          earliest: collectionDates[0],
          latest: collectionDates[collectionDates.length - 1],
        }
      : null

    return c.json({
      subjects: subjectsWithSpecimens,
      specimenTypes: specimenTypes.map(st => ({ id: st.id, name: st.name })),
      dateRange,
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create study
studies.post('/', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      shortCode: z.string().min(1),
      isLongitudinal: z.boolean(),
      leadPerson: z.string().min(1),
    })
    
    const data = schema.parse(body)
    const user = c.get('user')
    
    const [newStudy] = await database
      .insert(study)
      .values({
        ...data,
        created: utcNow(),
        lastUpdated: utcNow(),
        createdBy: user?.id,
        updatedBy: user?.id,
      })
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: insert must return row
    if (!newStudy) {
      throw new Error('Insert did not return study row')
    }
    return c.json({ study: newStudy }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Update study
studies.put('/:id', memberMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid study ID' }, 400)
    }

    // Check if study exists
    const existingStudy = await database
      .select()
      .from(study)
      .where(eq(study.id, id))
      .get()

    if (!existingStudy) {
      throw new NotFoundError('Study', id)
    }

    const body = await c.req.json()
    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      shortCode: z.string().min(1).optional(),
      leadPerson: z.string().min(1).optional(),
    })
    
    const data = schema.parse(body)
    
    // Check for duplicate title if title is being updated
    if (data.title && data.title !== existingStudy.title) {
      const duplicateTitle = await database
        .select({ id: study.id })
        .from(study)
        .where(eq(study.title, data.title))
        .get()
      
      if (duplicateTitle) {
        throw new ConflictError(`Study title '${data.title}' already exists`)
      }
    }
    
    // Check for duplicate shortCode if shortCode is being updated
    if (data.shortCode && data.shortCode !== existingStudy.shortCode) {
      const duplicateShortCode = await database
        .select({ id: study.id })
        .from(study)
        .where(eq(study.shortCode, data.shortCode))
        .get()
      
      if (duplicateShortCode) {
        throw new ConflictError(`Study short code '${data.shortCode}' already exists`)
      }
    }
    
    // Update study (isLongitudinal cannot be changed after creation)
    const user = c.get('user')
    const [updatedStudy] = await database
      .update(study)
      .set({
        ...data,
        lastUpdated: utcNow(),
        updatedBy: user?.id,
      })
      .where(eq(study.id, id))
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: update must return row
    if (!updatedStudy) {
      return c.json({ error: 'Study not found' }, 404)
    }
    return c.json({ study: updatedStudy })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Delete study and all dependent data (cascade). Tutorial studies (short code in TUT* namespace) may be deleted by any user; others require admin.
studies.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid study ID' }, 400)
    }

    const existingStudy = await database
      .select()
      .from(study)
      .where(eq(study.id, id))
      .get()

    if (!existingStudy) {
      throw new NotFoundError('Study', id)
    }

    const isTutorialStudy = existingStudy.shortCode.toUpperCase().startsWith(TUTORIAL_SHORT_CODE_PREFIX)
    if (!isTutorialStudy) {
      const user = c.get('user')
      if (!user || user.role !== 'admin') {
        return c.json({ error: 'Only administrators can delete non-tutorial studies.' }, 403)
      }
    }

    const subjects = await database
      .select({ id: studySubject.id })
      .from(studySubject)
      .where(eq(studySubject.studyId, id))

    const subjectIds = subjects.map((s) => s.id)
    let specimenIds: number[] = []
    if (subjectIds.length > 0) {
      const specimens = await database
        .select({ id: specimen.id })
        .from(specimen)
        .where(inArray(specimen.studySubjectId, subjectIds))
      specimenIds = specimens.map((s) => s.id)
    }

    let containerIds: number[] = []
    if (specimenIds.length > 0) {
      const containers = await database
        .select({ id: storageContainer.id })
        .from(storageContainer)
        .where(inArray(storageContainer.specimenId, specimenIds))
      containerIds = containers.map((c) => c.id)
    }

    const SQLITE_BATCH = 500
    const runBatch = <T>(ids: number[], fn: (batch: number[]) => void) => {
      for (let i = 0; i < ids.length; i += SQLITE_BATCH) {
        fn(ids.slice(i, i + SQLITE_BATCH))
      }
    }

    await database.transaction(async (tx) => {
      if (containerIds.length > 0) {
        runBatch(containerIds, (batch) => {
          tx.delete(storageContainerTag)
            .where(inArray(storageContainerTag.storageContainerId, batch))
            .run()
        })
        runBatch(containerIds, (batch) => {
          tx.delete(containerDerivation)
            .where(
              or(
                inArray(containerDerivation.parentContainerId, batch),
                inArray(containerDerivation.childContainerId, batch)
              )
            )
            .run()
        })
        runBatch(containerIds, (batch) => {
          tx.delete(paper).where(inArray(paper.id, batch)).run()
          tx.delete(micronixTube).where(inArray(micronixTube.id, batch)).run()
          tx.delete(cryovialTube).where(inArray(cryovialTube.id, batch)).run()
          tx.delete(staticWell).where(inArray(staticWell.id, batch)).run()
        })
        runBatch(containerIds, (batch) => {
          tx.delete(storageContainer).where(inArray(storageContainer.id, batch)).run()
        })
      }
      if (specimenIds.length > 0) {
        runBatch(specimenIds, (batch) => {
          tx.delete(specimen).where(inArray(specimen.id, batch)).run()
        })
      }
      if (subjectIds.length > 0) {
        runBatch(subjectIds, (batch) => {
          tx.delete(studySubject).where(inArray(studySubject.id, batch)).run()
        })
      }
      const deleted = await tx.delete(study).where(eq(study.id, id)).returning()
      if (deleted.length === 0) {
        throw new NotFoundError('Study', id)
      }
    })

    return c.json({ message: 'Study deleted successfully' })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return studies
}

// Default export removed - routes must be created with database injection via createStudiesRoutes()
// This will be handled in index.ts
