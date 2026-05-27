import { Hono } from 'hono'
import type { Database } from '../db/client'
import {
  specimen,
  studySubject,
  study,
  specimenType,
  storageContainer,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import {
  buildContainerQuery,
  buildContainerQueryByMicronixBarcodes,
  buildMultiStudyContainerQuery,
  resolveMicronixBarcodesToContainers,
} from '../lib/export/query'
import { enrichContainerData } from '../lib/export/enrich'
import { filterContainerIdsByType } from '../lib/export/filter'
import { formatAsCSV, formatAsExcel, formatAsJSON, formatSimpleCSV } from '../lib/export/format'
import { buildExportSummary, validateStudyCodes } from '../lib/export/validate'
import type {
  CSVExportOptions,
  ExportFilters,
  ExportSummary,
  MultiStudyExportEntry,
} from '../lib/export/types'
import { exportSpecimensCsv } from '../lib/export/specimens-csv'
import { resolveSubjectNamesByStudy } from '../lib/identifier-resolution'
import { resolveStudyByShortCode } from '../lib/identifier-resolution'
import { createAuthMiddleware } from '../middleware/auth'

/**
 * Helper function to parse CSV options from query params or request body
 */
function parseCSVOptions(params: any): CSVExportOptions {
  return {
    delimiter: (params.csv_delimiter as ',' | ';' | '\t' | undefined) ?? ',',
    includeBOM: params.csv_bom !== false && params.csv_bom !== 'false', // Default to true
    lineEnding: (params.csv_line_ending as 'LF' | 'CRLF' | undefined) ?? 'CRLF',
  }
}

/**
 * Format a date as a filesystem-safe local datetime string
 * Format: YYYY-MM-DD_HH-MM-SS (e.g., "2026-01-27_14-30-45")
 */
function formatLocalDateTime(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

/**
 * Create export routes with database injection
 * @param database - Database instance (required)
 */
export function createExportRoutes(database: Database): Hono {
  const export_ = new Hono()
  const authMiddleware = createAuthMiddleware(database)

// Export specimens as CSV
export_.get('/specimens.csv', authMiddleware, async (c) => {
  try {
    const csvOptions: CSVExportOptions = {
      delimiter: (c.req.query('csv_delimiter') as ',' | ';' | '\t' | undefined) ?? ',',
      includeBOM: c.req.query('csv_bom') !== 'false',
      lineEnding: (c.req.query('csv_line_ending') as 'LF' | 'CRLF' | undefined) ?? 'CRLF',
    }
    const csv = await exportSpecimensCsv(
      database,
      {
        studyCode: c.req.query('study'),
        sourceType: c.req.query('source_type') as 'subject' | 'control' | undefined,
      },
      csvOptions
    )
    c.header('Content-Type', 'text/csv')
    c.header('Content-Disposition', `attachment; filename="specimens_${formatLocalDateTime()}.csv"`)
    return c.text(csv)
  } catch (error: any) {
    console.error('Error exporting specimens:', error)
    return c.json({ error: 'Failed to export specimens', details: error.message }, 500)
  }
})

// Export inventory summary
export_.get('/inventory.csv', authMiddleware, async (c) => {
  try {
    // Parse CSV options from query params
    const csvOptions: CSVExportOptions = {
      delimiter: (c.req.query('csv_delimiter') as ',' | ';' | '\t' | undefined) ?? ',',
      includeBOM: c.req.query('csv_bom') !== 'false', // Default to true
      lineEnding: (c.req.query('csv_line_ending') as 'LF' | 'CRLF' | undefined) ?? 'CRLF',
    }
    
    // Get all specimens
    const allSpecimens = await database
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
    
    // Convert to CSV using the helper function
    const headers = ['source_type', 'count']
    const rows = Object.entries(counts).map(([type, count]) => [type, count])
    const csv = formatSimpleCSV(headers, rows, csvOptions)
    
    c.header('Content-Type', 'text/csv')
    c.header('Content-Disposition', `attachment; filename="inventory_${formatLocalDateTime()}.csv"`)
    return c.text(csv)
  } catch (error: any) {
    console.error('Error exporting inventory:', error)
    return c.json({ error: 'Failed to export inventory', details: error.message }, 500)
  }
})

// Export containers with full context
export_.get('/containers', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const userId = user?.id
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

    // Get columns if provided
    const columns = c.req.query('columns') ? JSON.parse(c.req.query('columns') as string) : undefined

    // Build query and get containers
    let containers, study, specimens
    try {
      const result = await buildContainerQuery(database, filters)
      containers = result.containers
      study = result.study
      specimens = result.specimens
    } catch (error: any) {
      return c.json({ error: error.message }, 404)
    }

    if (countOnly) {
      let filteredContainers = containers
      if (filters.container_types && filters.container_types.length > 0 && filteredContainers.length > 0) {
        const containerIds = filteredContainers.map((c: { id: number }) => c.id)
        const matchingIds = await filterContainerIdsByType(database, containerIds, filters.container_types)
        filteredContainers = filteredContainers.filter((c: { id: number }) => matchingIds.includes(c.id))
      }
      return c.json({ count: filteredContainers.length })
    }

    if (containers.length === 0) {
      return c.json({ error: 'No containers found for this study' }, 404)
    }

    // Enrich container data (this also applies container type filtering)
    const enrichedData = await enrichContainerData(database, containers, specimens || [], study, filters.container_types, undefined)

    // Determine format and validate
    const formatParam = c.req.query('format') as string | undefined
    const validFormats = ['csv', 'xlsx', 'json']
    if (!formatParam || !validFormats.includes(formatParam)) {
      return c.json({ error: 'Invalid format. Use csv, xlsx, or json.' }, 400)
    }
    const format = formatParam as 'csv' | 'xlsx' | 'json'

    // Generate filename with local datetime
    const timestamp = formatLocalDateTime()
    const filename = `study_${study.shortCode}_export_${timestamp}`

    if (format === 'json') {
      const jsonData = await formatAsJSON(database, enrichedData, filters, study, columns, userId)
      c.header('Content-Type', 'application/json')
      c.header('Content-Disposition', `attachment; filename="${filename}.json"`)
      return c.json(jsonData)
    }

    if (format === 'csv') {
      const csvOptions = parseCSVOptions(c.req.query())
      const csv = await formatAsCSV(database, enrichedData, columns, csvOptions, userId)
      c.header('Content-Type', 'text/csv')
      c.header('Content-Disposition', `attachment; filename="${filename}.csv"`)
      return c.text(csv)
    }

    // format === 'xlsx'
    const excelBuffer = await formatAsExcel(database, enrichedData, columns, userId)
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    c.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`)
    return c.body(new Uint8Array(excelBuffer), 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  } catch (error: any) {
    console.error('Error exporting containers:', error)
    return c.json({ error: 'Failed to export containers', details: error.message }, 500)
  }
})

// Export containers by subject names (POST endpoint)
export_.post('/containers', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const userId = user?.id
    const body = await c.req.json()
    const studyCode = body.study
    if (!studyCode) {
      return c.json({ error: 'Study parameter is required' }, 400)
    }

    // Resolve study
    const studyId = await resolveStudyByShortCode(database, studyCode)
    if (!studyId) {
      return c.json({ error: 'Study not found' }, 404)
    }

    // Get subject names from request
    const subjectNames = body.subject_names || []
    if (!Array.isArray(subjectNames) || subjectNames.length === 0) {
      return c.json({ error: 'subject_names array is required' }, 400)
    }

    // Resolve subject names to IDs
    const subjectNameToId = await resolveSubjectNamesByStudy(database, subjectNames, studyId)
    const subjectIds = Array.from(subjectNameToId.values())
    
    // Build subject ID to name map
    const subjectIdToName = new Map<number, string>()
    for (const [name, id] of subjectNameToId.entries()) {
      subjectIdToName.set(id, name)
    }

    if (subjectIds.length === 0) {
      // No subjects found - return empty result with summary
      const summary: ExportSummary = {
        total_containers: 0,
        subjects_with_results: [],
        subjects_no_results: [],
        subjects_not_found: subjectNames,
        errors: [],
      }
      return c.json({
        summary,
        data: [],
        format: body.format || 'json',
        filename: `study_${studyCode}_export_${formatLocalDateTime()}`,
      })
    }

    // Parse filter parameters
    const filters: ExportFilters = {
      study: studyCode,
      subject_ids: subjectIds,
      date_tolerance: body.date_tolerance || 0,
    }

    // Parse subject dates
    if (body.subject_dates && typeof body.subject_dates === 'object') {
      filters.subject_dates = {}
      for (const [subjectName, dateFilter] of Object.entries(body.subject_dates)) {
        const subjectId = subjectNameToId.get(subjectName)
        if (subjectId) {
          filters.subject_dates[subjectId] = dateFilter as any
        }
      }
    }

    // Parse other filter parameters
    if (body.specimen_type_ids && Array.isArray(body.specimen_type_ids)) {
      filters.specimen_type_ids = body.specimen_type_ids.map((id: any) => parseInt(String(id))).filter((id: number) => !isNaN(id))
    }

    if (body.container_types && Array.isArray(body.container_types)) {
      filters.container_types = body.container_types
    }

    if (body.date_from) {
      filters.date_from = body.date_from
    }
    if (body.date_to) {
      filters.date_to = body.date_to
    }
    if (body.created_from) {
      filters.created_from = body.created_from
    }
    if (body.created_to) {
      filters.created_to = body.created_to
    }

    // Check if this is just a count request
    const countOnly = body.count_only === true

    // Build query and get containers
    let containers, study, specimens
    try {
      const result = await buildContainerQuery(database, filters)
      containers = result.containers
      study = result.study
      specimens = result.specimens
    } catch (error: any) {
      return c.json({ error: error.message }, 404)
    }

    if (countOnly) {
      // Apply container type filter if specified
      let filteredContainers = containers
      if (filters.container_types && filters.container_types.length > 0) {
        const containerIds = containers.map(c => c.id)
        const matchingIds = await filterContainerIdsByType(database, containerIds, filters.container_types)
        filteredContainers = containers.filter(c => matchingIds.includes(c.id))
      }
      
      // Build summary for count
      const summary: ExportSummary = {
        total_containers: filteredContainers.length,
        subjects_with_results: [],
        subjects_no_results: [],
        subjects_not_found: subjectNames.filter(name => !subjectNameToId.has(name)),
        errors: [],
      }
      
      return c.json({ count: filteredContainers.length, summary })
    }

    // Enrich container data
    const enrichedData = await enrichContainerData(database, containers, specimens || [], study, filters.container_types, undefined)

    // Build summary
    const summary = await buildExportSummary(
      enrichedData,
      subjectNames,
      subjectNameToId,
      subjectIdToName
    )

    // Determine format
    const format = (body.format || 'json') as 'csv' | 'xlsx' | 'json'
    // Get columns if provided
    const columns = body.columns ? (Array.isArray(body.columns) ? body.columns : JSON.parse(body.columns)) : undefined

    // Generate filename with local datetime
    const timestamp = formatLocalDateTime()
    const filename = `study_${study.shortCode}_export_${timestamp}`

    if (format === 'json') {
      const jsonData = await formatAsJSON(database, enrichedData, filters, study, columns, userId)
      return c.json({
        summary,
        data: jsonData.containers,
        format: 'json',
        filename: `${filename}.json`,
      })
    }

        if (format === 'csv') {
          const csvOptions = parseCSVOptions(body)
          const csv = await formatAsCSV(database, enrichedData, columns, csvOptions, userId)
          const base64Csv = Buffer.from(csv).toString('base64')
      return c.json({
        summary,
        data: base64Csv,
        format: 'csv',
        filename: `${filename}.csv`,
      })
    }

    // format === 'xlsx'
    const excelBuffer = await formatAsExcel(database, enrichedData, columns, userId)
    const base64Excel = excelBuffer.toString('base64')
    return c.json({
      summary,
      data: base64Excel,
      format: 'xlsx',
      filename: `${filename}.xlsx`,
    })
  } catch (error: any) {
    console.error('Error exporting containers by names:', error)
    return c.json({ error: 'Failed to export containers', details: error.message }, 500)
  }
})

// Get available specimen types and container types for a study
export_.get('/available-types', authMiddleware, async (c) => {
  try {
    const studyCode = c.req.query('study')
    if (!studyCode) {
      return c.json({ error: 'Study parameter is required' }, 400)
    }

    // Get the study
    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.shortCode, studyCode))
      .get()

    if (!studyRecord) {
      return c.json({ error: 'Study not found' }, 404)
    }

    // Get subject IDs for this study
    const subjects = await database
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
    let specimensQuery = database
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
    const specimenTypes = await database
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))

    // Get containers for these specimens
    const containers = await database
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
    const [micronixTubes, cryovialTubes, papers, staticWells] = await Promise.all([
      database.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.id, containerIds)),
      database.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.id, containerIds)),
      database.select({ id: paper.id }).from(paper).where(inArray(paper.id, containerIds)),
      database.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.id, containerIds)),
    ])

    const containerTypes: string[] = []
    if (micronixTubes.length > 0) containerTypes.push('micronix_tube')
    if (cryovialTubes.length > 0) containerTypes.push('cryovial_tube')
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

// Validate study codes (for multi-study export)
export_.post('/containers/validate-studies', authMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const studyCodes = body.study_codes || []
    
    if (!Array.isArray(studyCodes) || studyCodes.length === 0) {
      return c.json({ error: 'study_codes array is required' }, 400)
    }
    
    const validation = await validateStudyCodes(database, studyCodes)
    
    return c.json({
      valid: Array.from(validation.valid.entries()).map(([code, id]) => ({
        code,
        id,
        title: validation.studies.get(id)?.title,
        lead_person: validation.studies.get(id)?.leadPerson,
      })),
      invalid: validation.invalid,
      total_unique: studyCodes.length,
      valid_count: validation.valid.size,
      invalid_count: validation.invalid.length,
    })
  } catch (error: any) {
    console.error('Error validating study codes:', error)
    return c.json({ error: 'Failed to validate study codes', details: error.message }, 500)
  }
})

// Multi-study export endpoint
export_.post('/containers/multi-study', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const userId = user?.id
    const body = await c.req.json()
    const entries = body.entries || []
    
    if (!Array.isArray(entries) || entries.length === 0) {
      return c.json({ error: 'entries array is required' }, 400)
    }
    
    // Validate entries structure
    for (const entry of entries) {
      if (!entry.study_short_code || !entry.subject_name) {
        return c.json({ error: 'Each entry must have study_short_code and subject_name' }, 400)
      }
    }
    
    // Parse filter parameters
    const filters: Omit<ExportFilters, 'study' | 'subject_ids' | 'subject_dates'> = {}
    
    if (body.specimen_type_ids && Array.isArray(body.specimen_type_ids)) {
      filters.specimen_type_ids = body.specimen_type_ids.map((id: any) => parseInt(String(id))).filter((id: number) => !isNaN(id))
    }
    
    if (body.container_types && Array.isArray(body.container_types)) {
      filters.container_types = body.container_types
    }
    
    if (body.date_from) {
      filters.date_from = body.date_from
    }
    if (body.date_to) {
      filters.date_to = body.date_to
    }
    if (body.created_from) {
      filters.created_from = body.created_from
    }
    if (body.created_to) {
      filters.created_to = body.created_to
    }
    
    const dateTolerance = body.date_tolerance || 0
    const countOnly = body.count_only === true
    
    // Build multi-study query
    const result = await buildMultiStudyContainerQuery(database, entries as MultiStudyExportEntry[], filters, dateTolerance)
    
    if (countOnly) {
      return c.json({
        count: result.containers.length,
        summary: result.summary,
      })
    }
    
    // Determine format
    const format = (body.format || 'json') as 'csv' | 'xlsx' | 'json'
    // Get columns if provided
    const columns = body.columns ? (Array.isArray(body.columns) ? body.columns : JSON.parse(body.columns)) : undefined
    const timestamp = formatLocalDateTime()
    const filename = `multi_study_export_${timestamp}`
    
    if (format === 'json') {
      // For multi-study, we need to create a dummy study object for formatAsJSON
      // Since it's multi-study, we'll use the first study or create a generic one
      const firstStudy = result.studies.size > 0
        ? Array.from(result.studies.values())[0]
        : { id: 0, shortCode: 'MULTI', title: 'Multi-Study Export', description: null, leadPerson: '', isLongitudinal: false, created: '', lastUpdated: '', createdBy: null, updatedBy: null }
      const dummyFilters: ExportFilters = { study: 'MULTI' }
      const jsonData = await formatAsJSON(database, result.containers, dummyFilters, firstStudy, columns, userId)
      return c.json({
        summary: result.summary,
        data: jsonData.containers,
        format: 'json',
        filename: `${filename}.json`,
      })
    }
    
        if (format === 'csv') {
          const csvOptions = parseCSVOptions(body)
          const csv = await formatAsCSV(database, result.containers, columns, csvOptions, userId)
          const base64Csv = Buffer.from(csv).toString('base64')
      return c.json({
        summary: result.summary,
        data: base64Csv,
        format: 'csv',
        filename: `${filename}.csv`,
      })
    }
    
    // format === 'xlsx'
    const excelBuffer = await formatAsExcel(database, result.containers, columns, userId)
    const base64Excel = excelBuffer.toString('base64')
    return c.json({
      summary: result.summary,
      data: base64Excel,
      format: 'xlsx',
      filename: `${filename}.xlsx`,
    })
  } catch (error: any) {
    console.error('Error exporting containers from multiple studies:', error)
    return c.json({ error: 'Failed to export containers', details: error.message }, 500)
  }
})

// Export containers by micronix barcodes (POST endpoint)
export_.post('/containers/by-barcodes', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const userId = user?.id
    const body = await c.req.json()
    const barcodes = body.barcodes || []
    
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      return c.json({ error: 'barcodes array is required and must not be empty' }, 400)
    }

    // Resolve barcodes to container IDs (only micronix tubes)
    const barcodeToContainerId = await resolveMicronixBarcodesToContainers(database, barcodes)
    const containerIds = Array.from(barcodeToContainerId.values())
    
    // Track which barcodes were found/not found
    const foundBarcodes = Array.from(barcodeToContainerId.keys())
    const notFoundBarcodes = barcodes.filter(b => !barcodeToContainerId.has(b))

    if (containerIds.length === 0) {
      // No containers found
      const summary = {
        total_containers: 0,
        barcodes_found: [],
        barcodes_not_found: notFoundBarcodes,
      }
      return c.json({
        summary,
        data: [],
        format: body.format || 'json',
        filename: `barcode_export_${formatLocalDateTime()}`,
      })
    }

    // Build query to get containers with specimen/subject data
    let containers, specimens, studies, subjectToStudyMap
    try {
      const result = await buildContainerQueryByMicronixBarcodes(database, containerIds)
      containers = result.containers
      specimens = result.specimens
      studies = result.studies
      subjectToStudyMap = result.subjectToStudyMap
    } catch (error: any) {
      return c.json({ error: error.message }, 404)
    }

    if (containers.length === 0) {
      const summary = {
        total_containers: 0,
        barcodes_found: foundBarcodes,
        barcodes_not_found: notFoundBarcodes,
      }
      return c.json({
        summary,
        data: [],
        format: body.format || 'json',
        filename: `barcode_export_${formatLocalDateTime()}`,
      })
    }

    // Enrich container data
    // For multi-study, we use subjectToStudyMap to get the correct study for each container
    const firstStudy = studies.length > 0
      ? studies[0]
      : { id: 0, shortCode: 'MULTI', title: 'Multi-Study Export', description: null, leadPerson: '', isLongitudinal: false, created: '', lastUpdated: '', createdBy: null, updatedBy: null }
    
    const enrichedData = await enrichContainerData(database, containers, specimens, firstStudy, undefined, subjectToStudyMap)

    // Build summary
    const summary = {
      total_containers: enrichedData.length,
      barcodes_found: foundBarcodes,
      barcodes_not_found: notFoundBarcodes,
    }

    // Determine format
    const format = (body.format || 'json') as 'csv' | 'xlsx' | 'json'
    // Get columns if provided
    const columns = body.columns ? (Array.isArray(body.columns) ? body.columns : JSON.parse(body.columns)) : undefined
    const timestamp = formatLocalDateTime()
    const filename = `barcode_export_${timestamp}`

    if (format === 'json') {
      const dummyFilters: ExportFilters = { study: 'MULTI' }
      const jsonData = await formatAsJSON(database, enrichedData, dummyFilters, firstStudy, columns, userId)
      return c.json({
        summary,
        data: jsonData.containers,
        format: 'json',
        filename: `${filename}.json`,
      })
    }

    if (format === 'csv') {
      const csvOptions = parseCSVOptions(body)
      const csv = await formatAsCSV(database, enrichedData, columns, csvOptions, userId)
      const base64Csv = Buffer.from(csv).toString('base64')
      return c.json({
        summary,
        data: base64Csv,
        format: 'csv',
        filename: `${filename}.csv`,
      })
    }

    // format === 'xlsx'
    const excelBuffer = await formatAsExcel(database, enrichedData, columns, userId)
    const base64Excel = excelBuffer.toString('base64')
    return c.json({
      summary,
      data: base64Excel,
      format: 'xlsx',
      filename: `${filename}.xlsx`,
    })
  } catch (error: any) {
    console.error('Error exporting containers by barcodes:', error)
    return c.json({ error: 'Failed to export containers', details: error.message }, 500)
  }
})

  return export_
}
