import { Hono } from 'hono'
import { db } from '../db/client'
import { 
  specimen, 
  study, 
  storageContainer, 
  studySubject, 
  specimenType,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
} from '../db/schema'
import { sql, eq } from 'drizzle-orm'

const activity = new Hono()

// Get recent activity across all entity types
activity.get('/recent', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10')
    
    // Get recent specimens with enriched data
    const recentSpecimens = await db
      .select({
        id: specimen.id,
        type: sql<string>`'specimen'`.as('type'),
        created: specimen.created,
        lastUpdated: specimen.lastUpdated,
        specimenTypeName: specimenType.name,
        studySubjectId: specimen.studySubjectId,
        controlBatchId: specimen.controlBatchId,
      })
      .from(specimen)
      .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
      .orderBy(sql`COALESCE(${specimen.lastUpdated}, ${specimen.created}) DESC`)
      .limit(limit)
    
    // Enrich specimens with subject and study info
    const enrichedSpecimens = await Promise.all(
      recentSpecimens.map(async (spec) => {
        let label = `Specimen #${spec.id}`
        let context: string | undefined = undefined
        
        if (spec.specimenTypeName) {
          label = `${spec.specimenTypeName} Specimen #${spec.id}`
        }
        
        if (spec.studySubjectId) {
          try {
            const subject = await db
              .select({
                name: studySubject.name,
                studyId: studySubject.studyId,
              })
              .from(studySubject)
              .where(eq(studySubject.id, spec.studySubjectId))
              .get()
            
            if (subject) {
              const studyRecord = await db
                .select({
                  title: study.title,
                  shortCode: study.shortCode,
                })
                .from(study)
                .where(eq(study.id, subject.studyId))
                .get()
              
              if (studyRecord) {
                context = `${subject.name} • ${studyRecord.title} (${studyRecord.shortCode})`
              } else {
                context = subject.name
              }
            }
          } catch (e) {
            // Silently fail - context is optional
          }
        } else if (spec.controlBatchId) {
          context = 'Control batch'
        }
        
        return {
          id: spec.id,
          type: 'specimen' as const,
          timestamp: spec.lastUpdated || spec.created || '',
          label,
          context,
        }
      })
    )
    
    // Get recent studies with enriched data
    const recentStudies = await db
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
    
    // Get recent containers with enriched data
    const recentContainers = await db
      .select({
        id: storageContainer.id,
        created: storageContainer.created,
        lastUpdated: storageContainer.lastUpdated,
        specimenId: storageContainer.specimenId,
      })
      .from(storageContainer)
      .orderBy(sql`COALESCE(${storageContainer.lastUpdated}, ${storageContainer.created}) DESC`)
      .limit(limit)
    
    // Enrich containers with type, barcode, and specimen info
    const enrichedContainers = await Promise.all(
      recentContainers.map(async (container) => {
        // Determine container type by checking subtype tables
        const [micronixInfo, cryovialInfo, paperInfo, staticWellInfo] = await Promise.all([
          db.select({ barcode: micronixTube.barcode, position: micronixTube.position })
            .from(micronixTube)
            .where(eq(micronixTube.id, container.id))
            .get(),
          db.select({ barcode: cryovialTube.barcode, position: cryovialTube.position })
            .from(cryovialTube)
            .where(eq(cryovialTube.id, container.id))
            .get(),
          db.select({ barcode: paper.barcode, position: paper.position })
            .from(paper)
            .where(eq(paper.id, container.id))
            .get(),
          db.select({ position: staticWell.position })
            .from(staticWell)
            .where(eq(staticWell.id, container.id))
            .get(),
        ])
        
        let containerType = 'container'
        let barcode: string | null = null
        let position: string | null = null
        
        if (micronixInfo) {
          containerType = 'micronix_tube'
          barcode = micronixInfo.barcode || null
          position = micronixInfo.position || null
        } else if (cryovialInfo) {
          containerType = 'cryovial_tube'
          barcode = cryovialInfo.barcode || null
          position = cryovialInfo.position || null
        } else if (paperInfo) {
          containerType = 'paper'
          barcode = paperInfo.barcode || null
          position = paperInfo.position || null
        } else if (staticWellInfo) {
          containerType = 'static_well'
          position = staticWellInfo.position || null
        }
        
        // Format container type name
        const containerTypeName = containerType
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
        
        let label = `${containerTypeName} #${container.id}`
        if (barcode) {
          label = `${containerTypeName} (${barcode})`
        } else if (position) {
          label = `${containerTypeName} at ${position}`
        }
        
        let context: string | undefined = undefined
        
        // Get specimen info for context
        if (container.specimenId) {
          try {
            const spec = await db
              .select({
                id: specimen.id,
                specimenTypeId: specimen.specimenTypeId,
                studySubjectId: specimen.studySubjectId,
              })
              .from(specimen)
              .where(eq(specimen.id, container.specimenId))
              .get()
            
            if (spec) {
              const specType = await db
                .select({ name: specimenType.name })
                .from(specimenType)
                .where(eq(specimenType.id, spec.specimenTypeId))
                .get()
              
              if (specType) {
                context = specType.name
              }
              
              if (spec.studySubjectId) {
                try {
                  const subject = await db
                    .select({
                      name: studySubject.name,
                      studyId: studySubject.studyId,
                    })
                    .from(studySubject)
                    .where(eq(studySubject.id, spec.studySubjectId))
                    .get()
                  
                  if (subject) {
                    const studyRecord = await db
                      .select({
                        shortCode: study.shortCode,
                      })
                      .from(study)
                      .where(eq(study.id, subject.studyId))
                      .get()
                    
                    if (studyRecord) {
                      context = `${specType?.name || ''} • ${subject.name} (${studyRecord.shortCode})`.trim()
                    } else {
                      context = `${specType?.name || ''} • ${subject.name}`.trim()
                    }
                  }
                } catch (e) {
                  // Silently fail
                }
              }
            }
          } catch (e) {
            // Silently fail - context is optional
          }
        }
        
        return {
          id: container.id,
          type: 'container' as const,
          timestamp: container.lastUpdated || container.created || '',
          label,
          context,
        }
      })
    )
    
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
  } catch (error: any) {
    console.error('Error fetching recent activity:', error)
    return c.json({ error: 'Failed to fetch recent activity', details: error.message }, 500)
  }
})

export default activity
