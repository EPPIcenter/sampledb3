import { Hono } from 'hono'
import { db } from '../db/client'
import {
  specimen,
  studySubject,
  study,
  specimenType,
  storageContainer,
  micronixTube,
  cryovialTube,
  tube,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import {
  buildContainerQuery,
  enrichContainerData,
  filterContainersByType,
  formatAsCSV,
  formatAsJSON,
  formatAsExcel,
  type ExportFilters,
} from '../lib/export-helpers'

const export_ = new Hono()

// Export specimens as CSV
export_.get('/specimens.csv', async (c) => {
  try {
    const studyCode = c.req.query('study')
    const sourceType = c.req.query('source_type')
    
    let query = db
      .select({
        id: specimen.id,
        studySubjectId: specimen.studySubjectId,
        controlBatchId: specimen.controlBatchId,
        specimenType: specimenType.name,
        collectionDate: specimen.collectionDate,
        created: specimen.created,
      })
      .from(specimen)
      .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
    
    const conditions = []
    
    if (sourceType === 'subject') {
      conditions.push(sql`${specimen.studySubjectId} IS NOT NULL`)
    } else if (sourceType === 'control') {
      conditions.push(sql`${specimen.controlBatchId} IS NOT NULL`)
    }
    
    if (studyCode) {
      const studyRecord = await db
        .select()
        .from(study)
        .where(eq(study.shortCode, studyCode))
        .get()
      
      if (studyRecord) {
        const subjects = await db
          .select({ id: studySubject.id })
          .from(studySubject)
          .where(eq(studySubject.studyId, studyRecord.id))
        
        const subjectIds = subjects.map(s => s.id)
        if (subjectIds.length > 0) {
          if (subjectIds.length === 1) {
            conditions.push(eq(specimen.studySubjectId, subjectIds[0]))
          } else {
            conditions.push(inArray(specimen.studySubjectId, subjectIds))
          }
        }
      }
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions) as any) as any
    }
    
    const specimens = await query
  
    // Convert to CSV
    const headers = ['id', 'subject_id', 'control_batch_id', 'specimen_type', 'collection_date', 'created']
    const rows = specimens.map(s => [
      s.id,
      s.studySubjectId || '',
      s.controlBatchId || '',
      s.specimenType || '',
      s.collectionDate || '',
      s.created,
    ])
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    
    c.header('Content-Type', 'text/csv')
    c.header('Content-Disposition', `attachment; filename="specimens_${Date.now()}.csv"`)
    return c.text(csv)
  } catch (error: any) {
    console.error('Error exporting specimens:', error)
    return c.json({ error: 'Failed to export specimens', details: error.message }, 500)
  }
})

// Export inventory summary
export_.get('/inventory.csv', async (c) => {
  try {
    // Get all specimens
    const allSpecimens = await db
      .select({
        studySubjectId: specimen.studySubjectId,
        controlBatchId: specimen.controlBatchId,
      })
      .from(specimen)
    
    // Count by source type
    const counts: Record<string, number> = {
      subject: 0,
      control: 0,
      unknown: 0
    }
    for (const spec of allSpecimens) {
      if (spec.studySubjectId) {
        counts.subject++
      } else if (spec.controlBatchId) {
        counts.control++
      } else {
        counts.unknown++
      }
    }
    
    const csv = [
      'source_type,count',
      ...Object.entries(counts).map(([type, count]) => `${type},${count}`)
    ].join('\n')
    
    c.header('Content-Type', 'text/csv')
    c.header('Content-Disposition', `attachment; filename="inventory_${Date.now()}.csv"`)
    return c.text(csv)
  } catch (error: any) {
    console.error('Error exporting inventory:', error)
    return c.json({ error: 'Failed to export inventory', details: error.message }, 500)
  }
})

// Export containers with full context
export_.get('/containers', async (c) => {
  try {
    const studyCode = c.req.query('study')
    if (!studyCode) {
      return c.json({ error: 'Study parameter is required' }, 400)
    }

    // Parse filter parameters
    const filters: ExportFilters = {
      study: studyCode as string,
    }

    // Parse array parameters - use queries() to get all values for a key
    const specimenTypeIds = c.req.queries('specimen_type_ids')
    if (specimenTypeIds && specimenTypeIds.length > 0) {
      filters.specimen_type_ids = specimenTypeIds
        .map(id => parseInt(id))
        .filter(id => !isNaN(id))
    }

    const containerTypes = c.req.queries('container_types')
    if (containerTypes && containerTypes.length > 0) {
      filters.container_types = containerTypes
    }

    const stateIds = c.req.queries('state_ids')
    if (stateIds && stateIds.length > 0) {
      filters.state_ids = stateIds
        .map(id => parseInt(id))
        .filter(id => !isNaN(id))
    }

    const subjectIds = c.req.queries('subject_ids')
    if (subjectIds && subjectIds.length > 0) {
      filters.subject_ids = subjectIds
        .map(id => parseInt(id))
        .filter(id => !isNaN(id))
    }

    // Date filters
    if (c.req.query('date_from')) {
      filters.date_from = c.req.query('date_from') as string
    }
    if (c.req.query('date_to')) {
      filters.date_to = c.req.query('date_to') as string
    }
    if (c.req.query('created_from')) {
      filters.created_from = c.req.query('created_from') as string
    }
    if (c.req.query('created_to')) {
      filters.created_to = c.req.query('created_to') as string
    }

    // Check if this is just a count request
    const countOnly = c.req.query('count_only') === 'true'

    // Build query and get containers
    const { containers, study, specimens } = await buildContainerQuery(filters)

    if (!study) {
      return c.json({ error: 'Study not found' }, 404)
    }

    if (!containers || containers.length === 0) {
      return c.json({ error: 'No containers found' }, 404)
    }

    if (countOnly) {
      // Apply container type filter if specified
      let filteredContainers = containers
      if (filters.container_types && filters.container_types.length > 0) {
        const containerIds = containers.map(c => c.id)
        const matchingIds = await filterContainersByType(containerIds, filters.container_types)
        filteredContainers = containers.filter(c => matchingIds.includes(c.id))
      }
      return c.json({ count: filteredContainers.length })
    }

    // Enrich container data (this also applies container type filtering)
    const enrichedData = await enrichContainerData(containers, specimens || [], study, filters.container_types)

    // Determine format
    const format = (c.req.query('format') || 'csv') as 'csv' | 'xlsx' | 'json'

    // Generate filename
    const timestamp = Date.now()
    const filename = `study_${study.shortCode}_export_${timestamp}`

    if (format === 'json') {
      const jsonData = formatAsJSON(enrichedData, filters, study)
      c.header('Content-Type', 'application/json')
      c.header('Content-Disposition', `attachment; filename="${filename}.json"`)
      return c.json(jsonData)
    }

    if (format === 'csv') {
      const csv = formatAsCSV(enrichedData)
      c.header('Content-Type', 'text/csv')
      c.header('Content-Disposition', `attachment; filename="${filename}.csv"`)
      return c.text(csv)
    }

    if (format === 'xlsx') {
      const excelBuffer = await formatAsExcel(enrichedData)
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      c.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
      return c.body(new Uint8Array(excelBuffer), 200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    }

    return c.json({ error: 'Invalid format. Use csv, xlsx, or json' }, 400)
  } catch (error: any) {
    console.error('Error exporting containers:', error)
    return c.json({ error: 'Failed to export containers', details: error.message }, 500)
  }
})

// Get available specimen types and container types for a study
export_.get('/available-types', async (c) => {
  try {
    const studyCode = c.req.query('study')
    if (!studyCode) {
      return c.json({ error: 'Study parameter is required' }, 400)
    }

    // Get the study
    const studyRecord = await db
      .select()
      .from(study)
      .where(eq(study.shortCode, studyCode))
      .get()

    if (!studyRecord) {
      return c.json({ error: 'Study not found' }, 404)
    }

    // Get subject IDs for this study
    const subjects = await db
      .select({ id: studySubject.id })
      .from(studySubject)
      .where(eq(studySubject.studyId, studyRecord.id))

    const subjectIds = subjects.map(s => s.id)
    if (subjectIds.length === 0) {
      return c.json({
        specimen_types: [],
        container_types: [],
      })
    }

    // Get specimens for this study
    let specimensQuery = db
      .select({
        id: specimen.id,
        specimenTypeId: specimen.specimenTypeId,
      })
      .from(specimen)

    if (subjectIds.length === 1) {
      specimensQuery = specimensQuery.where(
        eq(specimen.studySubjectId, subjectIds[0])
      ) as any
    } else {
      specimensQuery = specimensQuery.where(
        inArray(specimen.studySubjectId, subjectIds)
      ) as any
    }

    const specimens = await specimensQuery
    const specimenIds = specimens.map(s => s.id)

    if (specimenIds.length === 0) {
      return c.json({
        specimen_types: [],
        container_types: [],
      })
    }

    // Get unique specimen type IDs
    const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]
    const specimenTypes = await db
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))

    // Get containers for these specimens
    const containers = await db
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .where(inArray(storageContainer.specimenId, specimenIds))

    const containerIds = containers.map(c => c.id)
    if (containerIds.length === 0) {
      return c.json({
        specimen_types: specimenTypes.map(st => ({ id: st.id, name: st.name })),
        container_types: [],
      })
    }

    // Check which container types exist
    const [micronixTubes, cryovialTubes, tubes, papers, staticWells] = await Promise.all([
      db.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.id, containerIds)),
      db.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.id, containerIds)),
      db.select({ id: tube.id }).from(tube).where(inArray(tube.id, containerIds)),
      db.select({ id: paper.id }).from(paper).where(inArray(paper.id, containerIds)),
      db.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.id, containerIds)),
    ])

    const containerTypes: string[] = []
    if (micronixTubes.length > 0) containerTypes.push('micronix_tube')
    if (cryovialTubes.length > 0) containerTypes.push('cryovial_tube')
    if (tubes.length > 0) containerTypes.push('tube')
    if (papers.length > 0) containerTypes.push('paper')
    if (staticWells.length > 0) containerTypes.push('static_well')

    return c.json({
      specimen_types: specimenTypes.map(st => ({ id: st.id, name: st.name })),
      container_types: containerTypes,
    })
  } catch (error: any) {
    console.error('Error fetching available types:', error)
    return c.json({ error: 'Failed to fetch available types', details: error.message }, 500)
  }
})

export default export_
