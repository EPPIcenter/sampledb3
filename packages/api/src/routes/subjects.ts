import { Hono } from 'hono'
import { db } from '../db/client'
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
  tube,
  paper,
  staticWell,
  location,
  bag,
} from '../db/schema'
import { eq, sql, and, inArray } from 'drizzle-orm'
import { validatePage, validateLimit } from '../lib/constants'
import { z } from 'zod'
import { resolveStudyByShortCode } from '../lib/identifier-resolution'
import { validateSubjectName, validateStudyShortCode, validateSpecimenData } from '../lib/validation'

const subjects = new Hono()

// List all subjects (for counting)
subjects.get('/', async (c) => {
  try {
    const page = validatePage(c.req.query('page'))
    const limit = validateLimit(c.req.query('limit'))
    const offset = (page - 1) * limit
    
    const [subjectsList, countResult] = await Promise.all([
      db.select().from(studySubject).limit(limit).offset(offset),
      db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(studySubject),
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
  } catch (error: any) {
    console.error('Error fetching subjects:', error)
    return c.json({ error: 'Failed to fetch subjects', details: error.message }, 500)
  }
})

// Get subject by ID
subjects.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: 'Invalid subject ID' }, 400)
    }

    const subject = await db
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
      return c.json({ error: 'Subject not found' }, 404)
    }

    return c.json({ subject })
  } catch (error: any) {
    console.error('Error fetching subject:', error)
    return c.json({ error: 'Failed to fetch subject', details: error.message }, 500)
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
    const subject = await db
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
      return c.json({ error: 'Subject not found' }, 404)
    }

    // Get all specimens for this subject
    const specimens = await db
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
          totalAliquots: 0,
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
    const specimenTypes = await db
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))

    const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

    // Get all containers for these specimens with units
    const containers = await db
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
        remainingQuantity: container.remainingQuantity || 0,
        unit: (container.unitSymbol as string | null) ?? 'units'
      })
    })

    // Get container type information with manifest names and locations
    const [micronixTubesList, cryovialBoxesList, boxesList, sheetsList, staticWellsList] = await Promise.all([
      (containerIds.length > 0
        ? db
            .select({ 
              id: micronixTube.id, 
              manifestId: micronixTube.manifestId,
              barcode: micronixTube.barcode,
              position: micronixTube.position,
              manifestName: micronixPlate.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(micronixTube)
            .leftJoin(micronixPlate, eq(micronixTube.manifestId, micronixPlate.id))
            .leftJoin(location, eq(micronixPlate.locationId, location.id))
            .where(inArray(micronixTube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: cryovialTube.id, 
              manifestId: cryovialTube.manifestId,
              barcode: cryovialTube.barcode,
              position: cryovialTube.position,
              manifestName: cryovialBox.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(cryovialTube)
            .leftJoin(cryovialBox, eq(cryovialTube.manifestId, cryovialBox.id))
            .leftJoin(location, eq(cryovialBox.locationId, location.id))
            .where(inArray(cryovialTube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: tube.id, 
              boxId: tube.boxId,
              boxPosition: tube.boxPosition,
              label: tube.label,
              manifestName: box.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(tube)
            .leftJoin(box, eq(tube.boxId, box.id))
            .leftJoin(location, eq(box.locationId, location.id))
            .where(inArray(tube.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: paper.id, 
              sheetId: paper.sheetId,
              barcode: paper.barcode,
              position: paper.position,
              manifestName: sheet.name,
              boxId: sheet.boxId,
              bagId: sheet.bagId,
            })
            .from(paper)
            .leftJoin(sheet, eq(paper.sheetId, sheet.id))
            .where(inArray(paper.id, containerIds))
        : []) as Promise<any[]>,
      (containerIds.length > 0
        ? db
            .select({ 
              id: staticWell.id, 
              manifestId: staticWell.manifestId,
              position: staticWell.position,
              manifestName: micronixPlate.name,
              locationRoot: location.locationRoot,
              levelI: location.levelI,
              levelII: location.levelII,
              levelIII: location.levelIII,
            })
            .from(staticWell)
            .leftJoin(micronixPlate, eq(staticWell.manifestId, micronixPlate.id))
            .leftJoin(location, eq(micronixPlate.locationId, location.id))
            .where(inArray(staticWell.id, containerIds))
        : []) as Promise<any[]>,
    ])

    const containerInfoMap = new Map<number, { type: string; manifestName: string; position?: string; id: number; locationPath?: string }>()
    
    function formatLocPath(loc: any, parentName?: string) {
      if (!loc || !loc.locationRoot) return parentName
      const parts = [loc.locationRoot, loc.levelI, loc.levelII]
      if (loc.levelIII) parts.push(loc.levelIII)
      let path = parts.filter(Boolean).join(' → ')
      if (parentName) {
        path += ` → ${parentName}`
      }
      return path
    }

    micronixTubesList.forEach(t => containerInfoMap.set(t.id, { type: 'micronix_tube', manifestName: t.manifestName || 'Unknown', position: t.position || undefined, id: t.manifestId, locationPath: formatLocPath(t) }))
    cryovialBoxesList.forEach(t => containerInfoMap.set(t.id, { type: 'cryovial_tube', manifestName: t.manifestName || 'Unknown', position: t.position || undefined, id: t.manifestId, locationPath: formatLocPath(t) }))
    boxesList.forEach(t => containerInfoMap.set(t.id, { type: 'tube', manifestName: t.manifestName || 'Unknown', position: t.boxPosition || undefined, id: t.boxId, locationPath: formatLocPath(t) }))
    
    // For papers, we need to fetch the parent location separately if it's nested
    for (const t of sheetsList) {
      let locPath: string | undefined
      if (t.boxId) {
        const res = await db.select({ box: box, location: location }).from(box).leftJoin(location, eq(box.locationId, location.id)).where(eq(box.id, t.boxId)).get()
        locPath = formatLocPath(res?.location, res?.box.name)
      } else if (t.bagId) {
        const res = await db.select({ bag: bag, location: location }).from(bag).leftJoin(location, eq(bag.locationId, location.id)).where(eq(bag.id, t.bagId)).get()
        locPath = formatLocPath(res?.location, res?.bag.name)
      }
      containerInfoMap.set(t.id, { type: 'paper', manifestName: t.manifestName || 'Unknown', position: t.position || undefined, id: t.sheetId, locationPath: locPath })
    }

    staticWellsList.forEach(t => containerInfoMap.set(t.id, { type: 'static_well', manifestName: t.manifestName || 'Unknown', position: t.position || undefined, id: t.manifestId, locationPath: formatLocPath(t) }))

    // Build enriched specimen list
    const enrichedSpecimens = specimens.map(spec => {
      const specContainers = containersBySpecimen.get(spec.id) || []
      const aliquotCount = specContainers.length
      
      const containerBreakdown: Record<string, number> = {}
      const unitBreakdown: Record<string, number> = {}
      const specimenContainersDetailed: any[] = []
      
      specContainers.forEach(c => {
        const info = containerInfoMap.get(c.id) || { type: 'unknown', manifestName: 'Unknown', position: undefined, id: 0, locationPath: undefined }
        containerBreakdown[info.type] = (containerBreakdown[info.type] || 0) + 1
        unitBreakdown[c.unit] = (unitBreakdown[c.unit] || 0) + c.remainingQuantity
        specimenContainersDetailed.push({
          id: c.id,
          type: info.type,
          remainingQuantity: c.remainingQuantity,
          unit: c.unit,
          manifestName: info.manifestName,
          position: info.position,
          manifestId: info.id,
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
        aliquotCount,
        containerBreakdown,
        unitBreakdown,
        containers: specimenContainersDetailed
      }
    })

    // Calculate summary statistics
    const totalAliquots = containers.length
    
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
        totalAliquots,
        specimenTypes: Object.entries(specimenTypeCounts).map(([name, count]) => ({
          name,
          count,
        })),
        containerTypes: containerTypeCounts,
        collectionDateRange,
        timeline,
      },
    })
  } catch (error: any) {
    console.error('Error fetching subject summary:', error)
    return c.json({ error: 'Failed to fetch subject summary', details: error.message }, 500)
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
      const resolved = await resolveStudyByShortCode(data.studyShortCode)
      if (!resolved) {
        return c.json({ error: `Study short code '${data.studyShortCode}' not found` }, 400)
      }
      studyId = resolved
    } else {
      return c.json({ error: 'Either studyId or studyShortCode is required' }, 400)
    }
    
    // Validate subject name
    const nameValidation = await validateSubjectName(studyId, data.name)
    if (!nameValidation.valid) {
      return c.json({ error: nameValidation.error }, 400)
    }
    
    const trimmedName = data.name.trim()
    const now = new Date().toISOString()
    
    const [newSubject] = await db
      .insert(studySubject)
      .values({
        studyId,
        name: trimmedName,
        created: now,
        lastUpdated: now,
      })
      .returning()
    
    return c.json({ subject: newSubject }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error creating subject:', error)
    return c.json({ error: 'Internal server error' }, 500)
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
      const studyValidation = await validateStudyShortCode(subject.studyShortCode)
      if (!studyValidation.valid || !studyValidation.studyId) {
        errors.push({
          index: i,
          error: studyValidation.error || 'Invalid study',
        })
        continue
      }
      
      // Validate subject name
      const nameValidation = await validateSubjectName(studyValidation.studyId, trimmedName)
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
    const insertedSubjects = []
    
    for (const subject of validSubjects) {
      const [newSubject] = await db
        .insert(studySubject)
        .values({
          studyId: subject.studyId,
          name: subject.name,
          created: now,
          lastUpdated: now,
        })
        .returning()
      
      insertedSubjects.push(newSubject)
    }
    
    return c.json({
      subjects: insertedSubjects,
      created: insertedSubjects.length,
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error creating subjects:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create subject with specimens atomically
subjects.post('/with-specimens', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      studyShortCode: z.string().min(1),
      subjectName: z.string().min(1),
      specimens: z.array(z.object({
        specimenTypeName: z.string().min(1),
        collectionDate: z.string().optional(),
      })),
    })
    
    const data = schema.parse(body)
    
    // Resolve study
    const studyValidation = await validateStudyShortCode(data.studyShortCode)
    if (!studyValidation.valid || !studyValidation.studyId) {
      return c.json({ error: studyValidation.error || 'Invalid study' }, 400)
    }
    const studyId = studyValidation.studyId
    
    // Validate subject name
    const trimmedName = data.subjectName.trim()
    const nameValidation = await validateSubjectName(studyId, trimmedName)
    if (!nameValidation.valid) {
      return c.json({ error: nameValidation.error }, 400)
    }
    
    // Validate all specimens
    const specimenErrors: Array<{ index: number; error: string }> = []
    const resolvedSpecimens: Array<{ sourceId: number; specimenTypeId: number; collectionDate?: string }> = []
    
    // First create the subject to get its ID
    const now = new Date().toISOString()
    const [newSubject] = await db
      .insert(studySubject)
      .values({
        studyId,
        name: trimmedName,
        created: now,
        lastUpdated: now,
      })
      .returning()
    
    // Now validate and prepare specimens
    for (let i = 0; i < data.specimens.length; i++) {
      const spec = data.specimens[i]
      
      // Validate specimen type
      const { resolveSpecimenTypeByName } = await import('../lib/identifier-resolution')
      const specimenTypeId = await resolveSpecimenTypeByName(spec.specimenTypeName)
      if (!specimenTypeId) {
        // Rollback subject creation
        await db.delete(studySubject).where(eq(studySubject.id, newSubject.id))
        return c.json({
          error: `Specimen type '${spec.specimenTypeName}' not found`,
          specimenIndex: i,
        }, 400)
      }
      
      // Validate collection date
      const { validateCollectionDate } = await import('../lib/validation')
      const dateValidation = validateCollectionDate(spec.collectionDate)
      if (!dateValidation.valid) {
        // Rollback subject creation
        await db.delete(studySubject).where(eq(studySubject.id, newSubject.id))
        return c.json({
          error: dateValidation.error || 'Invalid collection date',
          specimenIndex: i,
        }, 400)
      }
      
      resolvedSpecimens.push({
        sourceId: newSubject.id,
        specimenTypeId,
        collectionDate: spec.collectionDate,
      })
    }
    
    // Create all specimens
    const insertedSpecimens = []
    for (const spec of resolvedSpecimens) {
      const [newSpecimen] = await db
        .insert(specimen)
        .values({
          studySubjectId: spec.sourceId,
          specimenTypeId: spec.specimenTypeId,
          collectionDate: spec.collectionDate,
          created: now,
          lastUpdated: now,
        })
        .returning()
      
      insertedSpecimens.push(newSpecimen)
    }
    
    return c.json({
      subject: newSubject,
      specimens: insertedSpecimens,
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error creating subject with specimens:', error)
    return c.json({ error: 'Internal server error' }, 500)
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
    const existingSubject = await db
      .select()
      .from(studySubject)
      .where(eq(studySubject.id, id))
      .get()

    if (!existingSubject) {
      return c.json({ error: 'Subject not found' }, 404)
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
      const duplicate = await db
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
    const [updatedSubject] = await db
      .update(studySubject)
      .set({
        name: trimmedName,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(studySubject.id, id))
      .returning()
    
    return c.json({ subject: updatedSubject })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error updating subject:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default subjects
