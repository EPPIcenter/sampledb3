import { Hono } from 'hono'
import type { Database } from '../db/client'
import { 
  studySubject, 
  study, 
  specimen, 
  specimenType, 
  storageContainer,
  unit,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  box,
  sheet,
  paper,
  staticWell,
  location,
  bag,
  type Location,
} from '../db/schema'
import { eq, sql, and, inArray, or, isNull } from 'drizzle-orm'
import { validatePage, validateLimit } from '../lib/constants'
import { z } from 'zod'
import { resolveStudyByShortCode, resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from '../lib/identifier-resolution'
import { validateSubjectName, validateStudyShortCode, validateSpecimenData, validateCollectionDate, validateContainerTypeForSpecimenType, validateUnitForContainerType } from '../lib/validation'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from '../lib/defaults'
import { resolveCollection } from '../lib/collection-resolution'
import { resolveCollectionByName } from '../lib/collection-resolution'
import type { ContainerData } from '../lib/container-creation'
import { handleRouteError, NotFoundError, ValidationError } from '../lib/error-handler'

// Extended container data type for this endpoint (includes collectionLocationId)
interface ExtendedContainerData extends ContainerData {
  collectionLocationId?: number
}

/**
 * Create subjects routes with database injection
 * @param database - Database instance (required)
 */
export function createSubjectsRoutes(database: Database): Hono {
  const dbInstance = database
  const subjects = new Hono()

  // Wrapper functions that use dbInstance instead of global db
  async function resolveStudyByShortCodeLocal(shortCode: string): Promise<number | null> {
    const studyRecord = await dbInstance
      .select({ id: study.id })
      .from(study)
      .where(eq(study.shortCode, shortCode))
      .get()
    return studyRecord?.id ?? null
  }

  async function resolveSubjectByNameAndStudyLocal(
    subjectName: string,
    studyId: number
  ): Promise<number | null> {
    const subjectRecord = await dbInstance
      .select({ id: studySubject.id })
      .from(studySubject)
      .where(and(
        eq(studySubject.studyId, studyId),
        eq(studySubject.name, subjectName)
      ) as any)
      .get()
    return subjectRecord?.id ?? null
  }

  async function resolveSpecimenTypeByNameLocal(name: string): Promise<number | null> {
    const specimenTypeRecord = await dbInstance
      .select({ id: specimenType.id })
      .from(specimenType)
      .where(eq(specimenType.name, name))
      .get()
    return specimenTypeRecord?.id ?? null
  }

  async function validateStudyShortCodeLocal(shortCode: string): Promise<{ valid: boolean; error?: string; studyId?: number }> {
    const studyId = await resolveStudyByShortCodeLocal(shortCode)
    if (!studyId) {
      return { valid: false, error: `Study short code '${shortCode}' not found` }
    }
    return { valid: true, studyId }
  }

  async function validateSubjectNameLocal(studyId: number, name: string): Promise<{ valid: boolean; error?: string }> {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      return { valid: false, error: 'Subject name cannot be empty' }
    }
    if (trimmedName.length > 255) {
      return { valid: false, error: 'Subject name cannot exceed 255 characters' }
    }
    const existing = await dbInstance
      .select({ id: studySubject.id })
      .from(studySubject)
      .where(and(
        eq(studySubject.studyId, studyId),
        eq(studySubject.name, trimmedName)
      ) as any)
      .get()
    if (existing) {
      return { valid: false, error: `Subject name '${trimmedName}' already exists in this study` }
    }
    return { valid: true }
  }

  async function validateUnitForContainerTypeLocal(
    containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well',
    unitId: number
  ): Promise<{ valid: boolean; error?: string }> {
    const containerTypeUnit = await import('../db/schema').then(m => m.containerTypeUnit)
    const relationship = await dbInstance
      .select()
      .from(containerTypeUnit)
      .where(and(
        eq(containerTypeUnit.containerType, containerType),
        eq(containerTypeUnit.unitId, unitId)
      ) as any)
      .get()

    if (!relationship) {
      const unitRecord = await dbInstance.select().from(unit).where(eq(unit.id, unitId)).get()
      const unitSymbol = unitRecord?.symbol || `ID ${unitId}`
      return { valid: false, error: `Unit '${unitSymbol}' is not valid for container type '${containerType}'` }
    }

    return { valid: true }
  }

  async function getDefaultUnitLocal(containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well'): Promise<number> {
    // Get container defaults from settings table
    const settings = await import('../db/schema').then(m => m.settings)
    const defaultsRecord = await dbInstance
      .select()
      .from(settings)
      .where(eq(settings.key, 'container_defaults'))
      .get()
    
    if (!defaultsRecord || !defaultsRecord.value) {
      throw new Error('Container defaults are not configured. Please run database initialization.')
    }

    // Type guard for ContainerDefaults
    const defaults = defaultsRecord.value as Record<string, { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }> | null
    if (!defaults) {
      throw new Error('Container defaults are not configured. Please run database initialization.')
    }
    const containerDefaults = defaults[containerType]
    if (!containerDefaults || !containerDefaults.defaultUnitSymbol) {
      throw new Error(`Default unit symbol not configured for container type '${containerType}'. Please update settings.`)
    }

    const unitSymbol = containerDefaults.defaultUnitSymbol
    const unitRecord = await dbInstance
      .select()
      .from(unit)
      .where(eq(unit.symbol, unitSymbol))
      .get()
    
    if (!unitRecord) {
      throw new Error(`Unit symbol '${unitSymbol}' not found for container type '${containerType}'. Please update settings or create the unit.`)
    }

    return unitRecord.id as number
  }

  async function getDefaultTotalQuantityLocal(containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well'): Promise<number> {
    const settings = await import('../db/schema').then(m => m.settings)
    const defaultsRecord = await dbInstance
      .select()
      .from(settings)
      .where(eq(settings.key, 'container_defaults'))
      .get()
    
    if (!defaultsRecord || !defaultsRecord.value) {
      throw new Error('Container defaults are not configured. Please run database initialization.')
    }

    const defaults = defaultsRecord.value as Record<string, { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }> | null
    if (!defaults || !defaults[containerType]) {
      throw new Error(`Container defaults for container type '${containerType}' are not configured. Please run database initialization.`)
    }
    return defaults[containerType].totalQuantity
  }

  async function getDefaultRemainingQuantityLocal(containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well'): Promise<number> {
    const settings = await import('../db/schema').then(m => m.settings)
    const defaultsRecord = await dbInstance
      .select()
      .from(settings)
      .where(eq(settings.key, 'container_defaults'))
      .get()
    
    if (!defaultsRecord || !defaultsRecord.value) {
      throw new Error('Container defaults are not configured. Please run database initialization.')
    }

    const defaults = defaultsRecord.value as Record<string, { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }> | null
    if (!defaults || !defaults[containerType]) {
      throw new Error(`Container defaults for container type '${containerType}' are not configured. Please run database initialization.`)
    }
    return defaults[containerType].remainingQuantity
  }

// List all subjects (for counting)
subjects.get('/', async (c) => {
  try {
    const page = validatePage(c.req.query('page'))
    const limit = await validateLimit(c.req.query('limit'))
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
subjects.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
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
subjects.get('/:id/summary', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
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
        summary: {
          totalSpecimens: 0,
          totalContainers: 0,
          specimenTypes: [],
          containerTypes: {},
          collectionDateRange: null,
          timeline: [],
        },
      })
    }

    const specimenIds = specimens.map(s => s.id)
    const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]

    // Get specimen types
    const specimenTypes = await dbInstance
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))

    const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

    // Get all containers for these specimens with units
    const containers = await dbInstance
      .select({
        id: storageContainer.id,
        specimenId: storageContainer.specimenId,
        totalQuantity: storageContainer.totalQuantity,
        remainingQuantity: storageContainer.remainingQuantity,
        unitId: storageContainer.unitId,
        unitSymbol: unit.symbol,
      })
      .from(storageContainer)
      .leftJoin(unit, eq(storageContainer.unitId, unit.id))
      .where(inArray(storageContainer.specimenId, specimenIds))

    const containerIds = containers.map(c => c.id)

    // Count containers per specimen
    const containersBySpecimen = new Map<number, Array<{ id: number; remainingQuantity: number; unit: string }>>()
    containers.forEach(container => {
      if (!containersBySpecimen.has(container.specimenId)) {
        containersBySpecimen.set(container.specimenId, [])
      }
      containersBySpecimen.get(container.specimenId)!.push({
        id: container.id,
        remainingQuantity: container.remainingQuantity ?? 0,
        unit: (container.unitSymbol as string | null) || 'Unknown'
      })
    })

    // Get container type information with collection names and locations
    const [micronixTubesList, cryovialBoxesList, sheetsList, staticWellsList] = await Promise.all([
      (containerIds.length > 0
        ? dbInstance
            .select({ 
              id: micronixTube.id, 
              collectionId: micronixTube.collectionId,
              barcode: micronixTube.barcode,
              position: micronixTube.position,
              collectionName: micronixPlate.name,
              locationPath: location.path,
              locationName: location.name,
            })
            .from(micronixTube)
            .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
            .leftJoin(location, eq(micronixPlate.locationId, location.id))
            .where(inArray(micronixTube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? dbInstance
            .select({ 
              id: cryovialTube.id, 
              collectionId: cryovialTube.collectionId,
              barcode: cryovialTube.barcode,
              position: cryovialTube.position,
              collectionName: cryovialBox.name,
              locationPath: location.path,
              locationName: location.name,
            })
            .from(cryovialTube)
            .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
            .leftJoin(location, eq(cryovialBox.locationId, location.id))
            .where(inArray(cryovialTube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? dbInstance
            .select({ 
              id: paper.id, 
              sheetId: paper.sheetId,
              barcode: paper.barcode,
              position: paper.position,
              collectionName: sheet.name,
              boxId: sheet.boxId,
              bagId: sheet.bagId,
            })
            .from(paper)
            .leftJoin(sheet, eq(paper.sheetId, sheet.id))
            .where(inArray(paper.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? dbInstance
            .select({ 
              id: staticWell.id, 
              collectionId: staticWell.collectionId,
              position: staticWell.position,
              collectionName: micronixPlate.name,
              locationPath: location.path,
              locationName: location.name,
            })
            .from(staticWell)
            .leftJoin(micronixPlate, eq(staticWell.collectionId, micronixPlate.id))
            .leftJoin(location, eq(micronixPlate.locationId, location.id))
            .where(inArray(staticWell.id, containerIds))
        : []) as Promise<any[]>,
    ])

    const containerInfoMap = new Map<number, { type: string; collectionName: string; position?: string; id: number; locationPath?: string }>()
    
    function formatLocPath(loc: { path?: string | null; locationPath?: string | null; name?: string; locationName?: string | null } | null | undefined, parentName?: string): string | undefined {
      if (!loc) return parentName || undefined
      // Use the materialized path if available, otherwise use name
      const path = loc.path || loc.locationPath
      const name = loc.name || loc.locationName
      if (path) {
        return parentName ? `${path} → ${parentName}` : path
      }
      if (name) {
        return parentName ? `${name} → ${parentName}` : name
      }
      return parentName || undefined
    }
    
    micronixTubesList.forEach(t => containerInfoMap.set(t.id, { type: 'micronix_tube', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))
    cryovialBoxesList.forEach(t => containerInfoMap.set(t.id, { type: 'cryovial_tube', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))
    
    // For papers, we need to fetch the parent location separately if it's nested
    for (const t of sheetsList) {
      let locPath: string | undefined
      if (t.boxId) {
        const res = await dbInstance
          .select({ 
            box: box, 
            locationPath: location.path,
            locationName: location.name,
          })
          .from(box)
          .leftJoin(location, eq(box.locationId, location.id))
          .where(eq(box.id, t.boxId))
          .get()
        locPath = formatLocPath(res, res?.box.name)
      } else if (t.bagId) {
        const res = await dbInstance
          .select({ 
            bag: bag, 
            locationPath: location.path,
            locationName: location.name,
          })
          .from(bag)
          .leftJoin(location, eq(bag.locationId, location.id))
          .where(eq(bag.id, t.bagId))
          .get()
        locPath = formatLocPath(res, res?.bag.name)
      }
      containerInfoMap.set(t.id, { type: 'paper', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.sheetId, locationPath: locPath })
    }

    staticWellsList.forEach(t => containerInfoMap.set(t.id, { type: 'static_well', collectionName: t.collectionName || 'Unknown', position: t.position || undefined, id: t.collectionId, locationPath: formatLocPath(t) }))

    // Build enriched specimen list
    const enrichedSpecimens = specimens.map(spec => {
      const specContainers = containersBySpecimen.get(spec.id) || []
      const containerCount = specContainers.length
      
      const containerBreakdown: Record<string, number> = {}
      const unitBreakdown: Record<string, number> = {}
      const specimenContainersDetailed: any[] = []
      
      specContainers.forEach(c => {
        const info = containerInfoMap.get(c.id) || { type: 'unknown', collectionName: 'Unknown', position: undefined, id: 0, locationPath: undefined }
        containerBreakdown[info.type] = (containerBreakdown[info.type] || 0) + 1
        unitBreakdown[c.unit] = (unitBreakdown[c.unit] || 0) + c.remainingQuantity
        specimenContainersDetailed.push({
          id: c.id,
          type: info.type,
          remainingQuantity: c.remainingQuantity,
          unit: c.unit,
          collectionName: info.collectionName,
          position: info.position,
          collectionId: info.id,
          locationPath: info.locationPath
        })
      })
      
      return {
        id: spec.id,
        specimenTypeId: spec.specimenTypeId,
        specimenTypeName: specimenTypeMap.get(spec.specimenTypeId) || 'Unknown',
        collectionDate: spec.collectionDate,
        created: spec.created,
        lastUpdated: spec.lastUpdated,
        containerCount,
        containerBreakdown,
        unitBreakdown,
        containers: specimenContainersDetailed
      }
    })

    // Calculate summary statistics
    const totalContainers = containers.length
    
    // Specimen type breakdown
    const specimenTypeCounts: Record<string, number> = {}
    enrichedSpecimens.forEach(spec => {
      const typeName = spec.specimenTypeName
      specimenTypeCounts[typeName] = (specimenTypeCounts[typeName] || 0) + 1
    })

    // Container type breakdown (aggregate)
    const containerTypeCounts: Record<string, number> = {}
    containers.forEach(container => {
      const info = containerInfoMap.get(container.id) || { type: 'unknown' }
      containerTypeCounts[info.type] = (containerTypeCounts[info.type] || 0) + 1
    })

    // Collection date range
    const collectionDates = enrichedSpecimens
      .map(s => s.collectionDate)
      .filter(Boolean)
      .sort()
    const collectionDateRange = collectionDates.length > 0
      ? {
          earliest: collectionDates[0],
          latest: collectionDates[collectionDates.length - 1],
        }
      : null

    // Timeline data (sorted by collection date)
    const timeline = enrichedSpecimens
      .map(spec => ({
        id: spec.id,
        date: spec.collectionDate || spec.created,
        specimenTypeName: spec.specimenTypeName,
        specimenTypeId: spec.specimenTypeId,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return c.json({
      subject,
      specimens: enrichedSpecimens,
      summary: {
        totalSpecimens: specimens.length,
        totalContainers,
        specimenTypes: Object.entries(specimenTypeCounts).map(([name, count]) => ({
          name,
          count,
        })),
        containerTypes: containerTypeCounts,
        collectionDateRange,
        timeline,
      },
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create single subject
subjects.post('/', async (c) => {
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
      const resolved = await resolveStudyByShortCodeLocal(data.studyShortCode)
      if (!resolved) {
        throw new NotFoundError(`Study with short code '${data.studyShortCode}'`)
      }
      studyId = resolved
    } else {
      return c.json({ error: 'Either studyId or studyShortCode is required' }, 400)
    }
    
    // Validate subject name
    const nameValidation = await validateSubjectNameLocal(studyId, data.name)
    if (!nameValidation.valid) {
      return c.json({ error: nameValidation.error }, 400)
    }
    
    const trimmedName = data.name.trim()
    const now = new Date().toISOString()
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
subjects.post('/bulk', async (c) => {
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
      const studyValidation = await validateStudyShortCodeLocal(subject.studyShortCode)
      if (!studyValidation.valid || !studyValidation.studyId) {
        errors.push({
          index: i,
          error: studyValidation.error || 'Invalid study',
        })
        continue
      }
      
      // Validate subject name
      const nameValidation = await validateSubjectNameLocal(studyValidation.studyId, trimmedName)
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
    
    // Insert all subjects in a transaction
    const now = new Date().toISOString()
    const user = c.get('user')
    const insertedSubjects = []
    
    for (const subject of validSubjects) {
      const [newSubject] = await dbInstance
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
      
      insertedSubjects.push(newSubject)
    }
    
    return c.json({
      subjects: insertedSubjects,
      created: insertedSubjects.length,
    }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

/**
 * Normalize position string to match frontend format (e.g., "B1" -> "B01")
 */
function normalizePosition(position: string | null | undefined): string | null {
  if (!position || !position.trim()) return null
  
  const trimmed = position.trim()
  const match = trimmed.match(/^([A-Z]+)(\d+)$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = match[2]
    return `${row}${col.padStart(2, '0')}`
  }
  
  return trimmed
}

// Create subject with specimens atomically
subjects.post('/with-specimens', async (c) => {
  try {
    const body = await c.req.json()
    
    // Container schema matching specimens.ts
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
      collectionLocationId: z.number().int().optional(), // For creating collections if needed
    }).optional()
    
    const schema = z.object({
      studyShortCode: z.string().min(1),
      subjectName: z.string().min(1),
      specimens: z.array(z.object({
        specimenTypeName: z.string().min(1),
        collectionDate: z.string().optional(),
        container: containerSchema,
      })),
    })
    
    const data = schema.parse(body)
    
    // Resolve study (validation before transaction)
    const studyValidation = await validateStudyShortCodeLocal(data.studyShortCode)
    if (!studyValidation.valid || !studyValidation.studyId) {
      return c.json({ error: studyValidation.error || 'Invalid study' }, 400)
    }
    const studyId = studyValidation.studyId
    
    // Check if subject exists
    const trimmedName = data.subjectName.trim()
    const existingSubjectId = await resolveSubjectByNameAndStudyLocal(trimmedName, studyId)
    const subjectCreated = !existingSubjectId
    
    // If subject doesn't exist, validate name
    if (!existingSubjectId) {
      const nameValidation = await validateSubjectNameLocal(studyId, trimmedName)
      if (!nameValidation.valid) {
        return c.json({ error: nameValidation.error }, 400)
      }
    }
    
    // Validate all specimens and container data before transaction
    const resolvedSpecimens: Array<{
      specimenTypeId: number
      collectionDate?: string
      container?: ExtendedContainerData
    }> = []
    
    for (let i = 0; i < data.specimens.length; i++) {
      const spec = data.specimens[i]
      
      // Validate specimen type
      const specimenTypeId = await resolveSpecimenTypeByNameLocal(spec.specimenTypeName)
      if (!specimenTypeId) {
        return c.json({
          error: `Specimen type '${spec.specimenTypeName}' not found`,
          specimenIndex: i,
        }, 400)
      }
      
      // Validate collection date
      const dateValidation = validateCollectionDate(spec.collectionDate)
      if (!dateValidation.valid) {
        return c.json({
          error: dateValidation.error || 'Invalid collection date',
          specimenIndex: i,
        }, 400)
      }
      
      // Validate container data if provided
      if (spec.container && spec.container.containerType) {
        // Validate container type is allowed for specimen type
        const containerTypeValidation = await validateContainerTypeForSpecimenType(
          specimenTypeId,
          spec.container.containerType,
          dbInstance
        )
        if (!containerTypeValidation.valid) {
          return c.json({
            error: containerTypeValidation.error || 'Invalid container type for specimen type',
            specimenIndex: i,
          }, 400)
        }
        
        // Validate required container fields
        if (spec.container.containerType === 'micronix_tube') {
          if (!spec.container.barcode) {
            return c.json({
              error: 'Barcode is required for micronix tubes',
              specimenIndex: i,
            }, 400)
          }
          if (!spec.container.collectionName && !spec.container.collectionBarcode) {
            return c.json({
              error: 'Collection name or barcode is required for micronix tubes',
              specimenIndex: i,
            }, 400)
          }
        } else if (spec.container.containerType === 'cryovial_tube') {
          if (!spec.container.collectionName && !spec.container.collectionBarcode) {
            return c.json({
              error: 'Collection name or barcode is required for cryovial tubes',
              specimenIndex: i,
            }, 400)
          }
        } else if (spec.container.containerType === 'paper') {
          if (!spec.container.collectionName) {
            return c.json({
              error: 'Collection name is required for papers',
              specimenIndex: i,
            }, 400)
          }
          if (!spec.container.label) {
            return c.json({
              error: 'Label is required for papers',
              specimenIndex: i,
            }, 400)
          }
        } else if (spec.container.containerType === 'static_well') {
          if (!spec.container.collectionName && !spec.container.collectionBarcode) {
            return c.json({
              error: 'Collection name or barcode is required for static wells',
              specimenIndex: i,
            }, 400)
          }
        }
      }
      
      resolvedSpecimens.push({
        specimenTypeId,
        collectionDate: spec.collectionDate,
        container: spec.container as ExtendedContainerData | undefined,
      })
    }
    
    // Resolve collections before transaction (for validation)
    const collectionMap = new Map<string, number>()
    for (const spec of resolvedSpecimens) {
      if (spec.container && spec.container.containerType) {
        const container = spec.container as ExtendedContainerData
        const containerType = container.containerType
        const collectionName = container.collectionName
        const collectionBarcode = container.collectionBarcode
        const collectionLocationId = container.collectionLocationId
        
        if (containerType === 'cryovial_tube' || containerType === 'micronix_tube' || containerType === 'static_well') {
          const collectionType = containerType === 'cryovial_tube' ? 'cryovial_box' : 'micronix_plate'
          const identifier = collectionName || collectionBarcode
          
          if (identifier) {
            // Try to resolve existing collection
            let existingCollectionId: number | null = null
            try {
              existingCollectionId = await resolveCollection(identifier, collectionType, dbInstance)
            } catch (e) {
              // Handle any unexpected errors from resolveCollection gracefully
              existingCollectionId = null
            }
            
            if (existingCollectionId) {
              const key = `${collectionType}-${identifier}`
              collectionMap.set(key, existingCollectionId)
            } else if (!collectionLocationId) {
              // Collection doesn't exist and no location provided
              return c.json({
                error: `Collection '${identifier}' not found. Please provide collectionLocationId to create it.`,
              }, 400)
            }
          }
        } else if (containerType === 'paper') {
          if (collectionName) {
            const existingBoxId = await resolveCollection(collectionName, 'box', dbInstance)
            if (existingBoxId) {
              collectionMap.set(`box-${collectionName}`, existingBoxId)
            } else if (!collectionLocationId) {
              return c.json({
                error: `Box '${collectionName}' not found. Please provide collectionLocationId to create it.`,
              }, 400)
            }
          }
        }
      }
    }
    
    // Prepare container data (async operations before transaction)
    const preparedContainers: Array<{
      unitId: number
      totalQuantity: number
      remainingQuantity: number
    }> = []
    
    for (const spec of resolvedSpecimens) {
      if (spec.container && spec.container.containerType) {
        const container = spec.container as ExtendedContainerData
        const containerType = container.containerType
        
        // Get unit (async, before transaction)
        const unitId = container.unitId || await getDefaultUnitLocal(containerType)
        
        // Validate unit (async, before transaction)
        const unitValidation = await validateUnitForContainerTypeLocal(containerType, unitId)
        if (!unitValidation.valid) {
          return c.json({
            error: unitValidation.error || 'Invalid unit for container type',
          }, 400)
        }
        
        // Get quantities (async, before transaction)
        const defaultTotalQty = await getDefaultTotalQuantityLocal(containerType)
        const defaultRemainingQty = await getDefaultRemainingQuantityLocal(containerType)
        const totalQty = container.totalQuantity ?? defaultTotalQty
        const remainingQty = container.remainingQuantity ?? container.totalQuantity ?? defaultRemainingQty
        
        preparedContainers.push({
          unitId,
          totalQuantity: totalQty,
          remainingQuantity: remainingQty,
        })
      } else {
        preparedContainers.push({
          unitId: 0, // Not used
          totalQuantity: 0,
          remainingQuantity: 0,
        })
      }
    }
    
    // Now execute everything in a synchronous transaction
    const user = c.get('user')
    let result
    try {
      result = dbInstance.transaction((tx) => {
      const now = new Date().toISOString()
      
      // Get or create subject
      let subjectId: number
      let subject: typeof studySubject.$inferSelect
      
      if (existingSubjectId) {
        // Use existing subject
        const existing = tx
          .select()
          .from(studySubject)
          .where(eq(studySubject.id, existingSubjectId))
          .get()
        if (!existing) {
          throw new Error('Subject not found')
        }
        subject = existing
        subjectId = existing.id
      } else {
        // Create new subject
        const newSubjectResult = tx
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
          .get()
        const newSubject = Array.isArray(newSubjectResult) ? newSubjectResult[0] : newSubjectResult
        subject = newSubject
        subjectId = newSubject.id
      }
      
      // Create specimens and containers
      const insertedSpecimens: Array<{
        specimen: typeof specimen.$inferSelect
        containerCreated: boolean
        containerId?: number
      }> = []
      
      for (let i = 0; i < resolvedSpecimens.length; i++) {
        const spec = resolvedSpecimens[i]
        const prepared = preparedContainers[i]
        
        // Create specimen
        const newSpecimenResult = tx
          .insert(specimen)
          .values({
            studySubjectId: subjectId,
            specimenTypeId: spec.specimenTypeId,
            collectionDate: spec.collectionDate,
            created: now,
            lastUpdated: now,
            createdBy: user?.id,
            updatedBy: user?.id,
          })
          .returning()
          .get()
        const newSpecimen = Array.isArray(newSpecimenResult) ? newSpecimenResult[0] : newSpecimenResult
        
        let containerCreated = false
        let containerId: number | undefined
        
        // Create container if provided
        if (spec.container && spec.container.containerType) {
          const container = spec.container as ExtendedContainerData
          const containerType = container.containerType
          
          // Create storage container
          const storageContainerResult = tx
            .insert(storageContainer)
            .values({
              specimenId: newSpecimen.id,
              unitId: prepared.unitId,
              totalQuantity: prepared.totalQuantity,
              remainingQuantity: prepared.remainingQuantity,
              comment: container.comment || null,
              created: now,
              lastUpdated: now,
            })
            .returning()
            .get()
          const storageContainerRecord = Array.isArray(storageContainerResult) ? storageContainerResult[0] : storageContainerResult
          
          containerId = storageContainerRecord.id
          containerCreated = true
          
          // Create specific container type
          if (containerType === 'micronix_tube') {
            // Resolve or create collection
            let collectionId: number
            const identifier = container.collectionName || container.collectionBarcode!
            const key = `micronix_plate-${identifier}`
            
            if (collectionMap.has(key)) {
              collectionId = collectionMap.get(key)!
            } else if (container.collectionLocationId) {
              // Create new collection
              const newPlateResult = tx
                .insert(micronixPlate)
                .values({
                  name: container.collectionName || identifier,
                  locationId: container.collectionLocationId,
                  barcode: container.collectionBarcode || null,
                  created: now,
                  lastUpdated: now,
                })
                .returning()
                .get()
              const newPlate = Array.isArray(newPlateResult) ? newPlateResult[0] : newPlateResult
              collectionId = newPlate.id
              collectionMap.set(key, collectionId)
            } else {
              throw new ValidationError('Collection not found and no location provided')
            }
            
            // Check barcode uniqueness
            if (container.barcode) {
              const existing = tx
                .select({ id: micronixTube.id })
                .from(micronixTube)
                .where(eq(micronixTube.barcode, container.barcode))
                .get()
              if (existing) {
                throw new Error(`Barcode '${container.barcode}' already exists`)
              }
            }
            
            tx.insert(micronixTube).values({
              id: containerId,
              collectionId,
              barcode: container.barcode!, // Already validated to be required
              position: normalizePosition(container.position),
            }).run()
          } else if (containerType === 'cryovial_tube') {
            // Resolve or create collection
            let collectionId: number
            const identifier = container.collectionName || container.collectionBarcode!
            const key = `cryovial_box-${identifier}`
            
            if (collectionMap.has(key)) {
              collectionId = collectionMap.get(key)!
            } else if (container.collectionLocationId) {
              // Create new collection
              const newBoxResult = tx
                .insert(cryovialBox)
                .values({
                  name: container.collectionName || identifier,
                  locationId: container.collectionLocationId,
                  barcode: container.collectionBarcode || null,
                  created: now,
                  lastUpdated: now,
                })
                .returning()
                .get()
              const newBox = Array.isArray(newBoxResult) ? newBoxResult[0] : newBoxResult
              collectionId = newBox.id
              collectionMap.set(key, collectionId)
            } else {
              throw new ValidationError('Collection not found and no location provided')
            }
            
            // Check barcode uniqueness if provided
            if (container.barcode) {
              const existing = tx
                .select({ id: cryovialTube.id })
                .from(cryovialTube)
                .where(eq(cryovialTube.barcode, container.barcode))
                .get()
              if (existing) {
                throw new Error(`Barcode '${container.barcode}' already exists`)
              }
            }
            
            tx.insert(cryovialTube).values({
              id: containerId,
              collectionId,
              barcode: container.barcode || null,
              position: normalizePosition(container.position),
            }).run()
          } else if (containerType === 'paper') {
            // Resolve or create box
            let boxId: number
            const boxName = container.collectionName!
            const key = `box-${boxName}`
            
            if (collectionMap.has(key)) {
              boxId = collectionMap.get(key)!
            } else if (container.collectionLocationId) {
              // Create new box
              const newBoxResult = tx
                .insert(box)
                .values({
                  name: boxName,
                  locationId: container.collectionLocationId,
                  created: now,
                  lastUpdated: now,
                })
                .returning()
                .get()
              const newBox = Array.isArray(newBoxResult) ? newBoxResult[0] : newBoxResult
              boxId = newBox.id
              collectionMap.set(key, boxId)
            } else {
              throw new ValidationError('Box not found and no location provided')
            }
            
            // Get or create sheet
            let sheetId: number
            const sheetName = container.label || 'Sheet-1'
            const existingSheet = tx
              .select()
              .from(sheet)
              .where(and(
                eq(sheet.name, sheetName),
                eq(sheet.boxId, boxId)
              ) as any)
              .get()
            
            if (existingSheet) {
              sheetId = existingSheet.id
            } else {
              const newSheetResult = tx
                .insert(sheet)
                .values({
                  name: sheetName,
                  boxId,
                  bagId: null,
                  created: sql`current_timestamp`,
                  lastUpdated: sql`current_timestamp`,
                })
                .returning()
                .get()
              const newSheet = Array.isArray(newSheetResult) ? newSheetResult[0] : newSheetResult
              sheetId = newSheet.id
            }
            
            tx.insert(paper).values({
              id: containerId,
              sheetId,
              barcode: container.barcode || null,
              position: normalizePosition(container.position),
            }).run()
          } else if (containerType === 'static_well') {
            // Resolve or create collection (same as micronix)
            let collectionId: number
            const identifier = container.collectionName || container.collectionBarcode!
            const key = `micronix_plate-${identifier}`
            
            if (collectionMap.has(key)) {
              collectionId = collectionMap.get(key)!
            } else if (container.collectionLocationId) {
              // Create new collection
              const newPlateResult = tx
                .insert(micronixPlate)
                .values({
                  name: container.collectionName || identifier,
                  locationId: container.collectionLocationId,
                  barcode: container.collectionBarcode || null,
                  created: now,
                  lastUpdated: now,
                })
                .returning()
                .get()
              const newPlate = Array.isArray(newPlateResult) ? newPlateResult[0] : newPlateResult
              collectionId = newPlate.id
              collectionMap.set(key, collectionId)
            } else {
              throw new ValidationError('Collection not found and no location provided')
            }
            
            tx.insert(staticWell).values({
              id: containerId,
              collectionId,
              position: normalizePosition(container.position),
            }).run()
          }
        }
        
        insertedSpecimens.push({
          specimen: newSpecimen,
          containerCreated,
          containerId,
        })
      }
      
      return {
        subject,
        subjectCreated,
        specimens: insertedSpecimens,
      }
      })
    } catch (transactionError) {
      // If it's a ValidationError, rethrow it so it gets handled as 400
      if (transactionError instanceof ValidationError) {
        throw transactionError
      }
      // For other errors, wrap them or rethrow
      throw transactionError
    }
    
    // Calculate summary
    const summary = {
      subjectsCreated: result.subjectCreated ? 1 : 0,
      subjectsUpdated: result.subjectCreated ? 0 : 1,
      specimensCreated: result.specimens.length,
      containersCreated: result.specimens.filter(s => s.containerCreated).length,
    }
    
    return c.json({
      subject: result.subject,
      subjectCreated: result.subjectCreated,
      specimens: result.specimens.map(s => ({
        ...s.specimen,
        containerCreated: s.containerCreated,
        containerId: s.containerId,
      })),
      summary: {
        subjectsCreated: summary.subjectsCreated,
        subjectsUpdated: summary.subjectsUpdated,
        specimensCreated: summary.specimensCreated,
        containersCreated: summary.containersCreated,
      },
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    // ValidationError should return 400
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400)
    }
    return handleRouteError(error, c)
  }
})

  // Helper function to validate subjects for merge
  async function validateSubjectsForMerge(targetId: number, sourceId: number): Promise<{ valid: boolean; error?: string; targetSubject?: typeof studySubject.$inferSelect; sourceSubject?: typeof studySubject.$inferSelect }> {
    if (targetId === sourceId) {
      return { valid: false, error: 'Cannot merge a subject with itself' }
    }

    const [targetSubject, sourceSubject] = await Promise.all([
      dbInstance.select().from(studySubject).where(eq(studySubject.id, targetId)).get(),
      dbInstance.select().from(studySubject).where(eq(studySubject.id, sourceId)).get(),
    ])

    if (!targetSubject) {
      return { valid: false, error: 'Target subject not found' }
    }

    if (!sourceSubject) {
      return { valid: false, error: 'Source subject not found' }
    }

    if (targetSubject.studyId !== sourceSubject.studyId) {
      return { valid: false, error: 'Subjects must be in the same study' }
    }

    return { valid: true, targetSubject, sourceSubject }
  }

  // Helper function to get subject specimen count
  async function getSubjectSpecimenCount(subjectId: number): Promise<number> {
    const result = await dbInstance
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(specimen)
      .where(eq(specimen.studySubjectId, subjectId))
    
    return result[0]?.count || 0
  }

  // Helper function to find matching specimen in target subject
  async function findMatchingSpecimen(
    targetSubjectId: number,
    specimenTypeId: number,
    collectionDate: string | null
  ): Promise<typeof specimen.$inferSelect | null> {
    // Build condition for collection date matching
    // Both NULL counts as a match, or exact string match
    const dateCondition = collectionDate === null
      ? isNull(specimen.collectionDate)
      : eq(specimen.collectionDate, collectionDate)

    const matchingSpecimen = await dbInstance
      .select()
      .from(specimen)
      .where(
        and(
          eq(specimen.studySubjectId, targetSubjectId),
          eq(specimen.specimenTypeId, specimenTypeId),
          dateCondition
        ) as any
      )
      .get()

    return matchingSpecimen || null
  }

// Merge subjects endpoint
subjects.post('/:targetId/merge', async (c) => {
  try {
    const targetId = parseInt(c.req.param('targetId'))
    
    if (isNaN(targetId)) {
      return c.json({ error: 'Invalid target subject ID' }, 400)
    }

    const body = await c.req.json()
    const schema = z.object({
      sourceId: z.number().int().positive(),
    })
    
    const data = schema.parse(body)
    const sourceId = data.sourceId

    // Validate subjects for merge
    const validation = await validateSubjectsForMerge(targetId, sourceId)
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400)
    }

    const { targetSubject, sourceSubject } = validation

    // Get all source specimens
    const sourceSpecimens = await dbInstance
      .select()
      .from(specimen)
      .where(eq(specimen.studySubjectId, sourceId))

    // Process merge in a transaction
    const user = c.get('user')
    const result = dbInstance.transaction((tx) => {
      const now = new Date().toISOString()

      // Statistics (declared inside transaction)
      let specimensTransferred = 0
      let specimensMerged = 0
      let containersMerged = 0
      let totalContainersTransferred = 0

      // Process each source specimen
      for (const sourceSpecimen of sourceSpecimens) {
        // Find matching specimen in target subject
        const matchingSpecimen = tx
          .select()
          .from(specimen)
          .where(
            and(
              eq(specimen.studySubjectId, targetId),
              eq(specimen.specimenTypeId, sourceSpecimen.specimenTypeId),
              sourceSpecimen.collectionDate === null
                ? isNull(specimen.collectionDate)
                : eq(specimen.collectionDate, sourceSpecimen.collectionDate)
            ) as any
          )
          .get()

        if (matchingSpecimen) {
          // Match found: transfer containers and delete source specimen
          // Get container count first
          const containerCountResult = tx
            .select({ count: sql<number>`COUNT(*)`.as('count') })
            .from(storageContainer)
            .where(eq(storageContainer.specimenId, sourceSpecimen.id))
            .get()

          const containerCount = containerCountResult?.count || 0
          containersMerged += containerCount
          totalContainersTransferred += containerCount

          // Update containers to point to target specimen
          if (containerCount > 0) {
            tx
              .update(storageContainer)
              .set({
                specimenId: matchingSpecimen.id,
                lastUpdated: now,
              })
              .where(eq(storageContainer.specimenId, sourceSpecimen.id))
              .run()
          }

          // Delete source specimen
          tx
            .delete(specimen)
            .where(eq(specimen.id, sourceSpecimen.id))
            .run()

          specimensMerged++
        } else {
          // No match: update source specimen's study_subject_id
          // Get container count
          const containerCountResult = tx
            .select({ count: sql<number>`COUNT(*)`.as('count') })
            .from(storageContainer)
            .where(eq(storageContainer.specimenId, sourceSpecimen.id))
            .get()

          totalContainersTransferred += containerCountResult?.count || 0

          tx
            .update(specimen)
            .set({
              studySubjectId: targetId,
              lastUpdated: now,
              updatedBy: user?.id,
            })
            .where(eq(specimen.id, sourceSpecimen.id))
            .run()

          specimensTransferred++
        }
      }

      // Update target subject's last_updated timestamp
      tx
        .update(studySubject)
        .set({
          lastUpdated: now,
          updatedBy: user?.id,
        })
        .where(eq(studySubject.id, targetId))
        .run()

      // Delete source subject
      tx
        .delete(studySubject)
        .where(eq(studySubject.id, sourceId))
        .run()

      return {
        specimensTransferred,
        specimensMerged,
        containersMerged,
        totalContainersTransferred,
      }
    })

    // Get updated target subject
    const updatedTargetSubject = await dbInstance
      .select()
      .from(studySubject)
      .where(eq(studySubject.id, targetId))
      .get()

    return c.json({
      success: true,
      ...result,
      targetSubject: updatedTargetSubject,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return handleRouteError(error, c)
  }
})

// Update subject
subjects.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
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
        lastUpdated: new Date().toISOString(),
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
