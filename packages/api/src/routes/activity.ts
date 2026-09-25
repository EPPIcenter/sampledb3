import { Hono } from 'hono'
import type { Database } from '../db/client'
import { 
  specimen, 
  study, 
  storageContainer, 
  studySubject, 
  specimenType,
  controlBatch,
  controlDefinition,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
} from '../db/schema'
import { sql, eq } from 'drizzle-orm'
import { createAuthMiddleware } from '../middleware/auth'
import { handleRouteError } from '../lib/error-handler'

/**
 * Create activity routes with database injection
 * @param database - Database instance (required)
 */
/** Upper bound for GET /activity/recent?limit=. */
const MAX_RECENT_ACTIVITY = 50

export function createActivityRoutes(database: Database): Hono {
  const activity = new Hono()
  const authMiddleware = createAuthMiddleware(database)

  // Get recent activity across all entity types
  activity.get('/recent', authMiddleware, async (c) => {
  try {
    // Keep the feed short, and never unbounded (SQLite treats LIMIT -1 as no limit).
    const requested = parseInt(c.req.query('limit') || '10')
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_RECENT_ACTIVITY) : 10
    
    // Recent specimens, joined to their subject/study or batch/definition in one query
    // (never expose DB IDs in labels)
    const recentSpecimens = await database
      .select({
        id: specimen.id,
        created: specimen.created,
        lastUpdated: specimen.lastUpdated,
        specimenTypeName: specimenType.name,
        collectionDate: specimen.collectionDate,
        controlBatchId: specimen.controlBatchId,
        studySubjectId: specimen.studySubjectId,
        batchName: controlBatch.name,
        productionDate: controlBatch.productionDate,
        definitionName: controlDefinition.name,
        subjectName: studySubject.name,
        studyTitle: study.title,
        studyShortCode: study.shortCode,
      })
      .from(specimen)
      .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
      .leftJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))
      .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
      .leftJoin(studySubject, eq(specimen.studySubjectId, studySubject.id))
      .leftJoin(study, eq(studySubject.studyId, study.id))
      .orderBy(sql`COALESCE(${specimen.lastUpdated}, ${specimen.created}) DESC`)
      .limit(limit)

    const enrichedSpecimens = recentSpecimens.map((spec) => {
      const specimenTypeName = spec.specimenTypeName || 'Specimen'
      let label: string = specimenTypeName
      let context: string | undefined = undefined

      if (spec.controlBatchId) {
        if (spec.batchName && spec.definitionName) {
          label = `${specimenTypeName} • ${spec.definitionName} (${spec.batchName})`
          context = spec.collectionDate || spec.productionDate || undefined
        } else {
          label = `${specimenTypeName} • Control batch`
        }
      } else if (spec.studySubjectId && spec.subjectName) {
        if (spec.studyShortCode) {
          label = `${specimenTypeName} • ${spec.subjectName} (${spec.studyShortCode})`
          context = spec.studyTitle ?? undefined
        } else {
          label = `${specimenTypeName} • ${spec.subjectName}`
        }
      }

      return {
        id: spec.id,
        type: 'specimen' as const,
        timestamp: spec.lastUpdated || spec.created || '',
        label,
        context,
      }
    })
    
    // Get recent studies with enriched data
    const recentStudies = await database
      .select({
        id: study.id,
        type: sql<string>`'study'`.as('type'),
        created: study.created,
        lastUpdated: study.lastUpdated,
        title: study.title,
        shortCode: study.shortCode,
      })
      .from(study)
      .orderBy(sql`COALESCE(${study.lastUpdated}, ${study.created}) DESC`)
      .limit(limit)
      .then(studies =>
        studies.map(s => ({
          id: s.id,
          type: 'study' as const,
          timestamp: s.lastUpdated || s.created || '',
          label: `${s.title} (${s.shortCode})`,
          context: undefined,
        }))
      )
    
    // Recent containers, joined to their subtype row and specimen/subject/study in one query
    const recentContainers = await database
      .select({
        id: storageContainer.id,
        created: storageContainer.created,
        lastUpdated: storageContainer.lastUpdated,
        micronixId: micronixTube.id,
        micronixBarcode: micronixTube.barcode,
        micronixPosition: micronixTube.position,
        cryovialId: cryovialTube.id,
        cryovialBarcode: cryovialTube.barcode,
        cryovialPosition: cryovialTube.position,
        paperId: paper.id,
        paperSublabel: paper.sublabel,
        wellId: staticWell.id,
        wellPosition: staticWell.position,
        specimenTypeName: specimenType.name,
        subjectName: studySubject.name,
        studyShortCode: study.shortCode,
      })
      .from(storageContainer)
      .leftJoin(micronixTube, eq(micronixTube.id, storageContainer.id))
      .leftJoin(cryovialTube, eq(cryovialTube.id, storageContainer.id))
      .leftJoin(paper, eq(paper.id, storageContainer.id))
      .leftJoin(staticWell, eq(staticWell.id, storageContainer.id))
      .leftJoin(specimen, eq(storageContainer.specimenId, specimen.id))
      .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
      .leftJoin(studySubject, eq(specimen.studySubjectId, studySubject.id))
      .leftJoin(study, eq(studySubject.studyId, study.id))
      .orderBy(sql`COALESCE(${storageContainer.lastUpdated}, ${storageContainer.created}) DESC`)
      .limit(limit)

    const enrichedContainers = recentContainers.map((container) => {
      let containerType = 'container'
      let barcode: string | null = null
      let position: string | null = null

      if (container.micronixId != null) {
        containerType = 'micronix_tube'
        barcode = container.micronixBarcode || null
        position = container.micronixPosition || null
      } else if (container.cryovialId != null) {
        containerType = 'cryovial_tube'
        barcode = container.cryovialBarcode || null
        position = container.cryovialPosition || null
      } else if (container.paperId != null) {
        containerType = 'paper'
        barcode = container.paperSublabel || null
      } else if (container.wellId != null) {
        containerType = 'static_well'
        position = container.wellPosition || null
      }

      // Format container type name (never expose DB IDs)
      const containerTypeName = containerType
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

      let label: string
      if (barcode) {
        label = `${containerTypeName} (${barcode})`
      } else if (position) {
        label = `${containerTypeName} at ${position}`
      } else {
        label = `Unnamed ${containerTypeName.toLowerCase()}`
      }

      let context: string | undefined = container.specimenTypeName ?? undefined
      if (container.subjectName) {
        const subject = container.studyShortCode
          ? `${container.subjectName} (${container.studyShortCode})`
          : container.subjectName
        context = `${container.specimenTypeName || ''} • ${subject}`.trim()
      }

      return {
        id: container.id,
        type: 'container' as const,
        timestamp: container.lastUpdated || container.created || '',
        label,
        context,
      }
    })
    
    // Combine and sort by timestamp
    const allActivity = [
      ...enrichedSpecimens,
      ...recentStudies,
      ...enrichedContainers,
    ]
      .filter(item => item.timestamp) // Filter out items without timestamps
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime()
        const timeB = new Date(b.timestamp).getTime()
        return timeB - timeA
      })
      .slice(0, limit)
    
    return c.json({ activity: allActivity })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return activity
}
