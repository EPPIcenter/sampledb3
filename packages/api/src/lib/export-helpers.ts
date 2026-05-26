import type { Database } from '../db/client'
import {
  storageContainer,
  specimen,
  specimenType,
  studySubject,
  study,
  controlBatch,
  controlDefinition,
  unit,
  strain,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, or, inArray, gte, lte, sql } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'
import { resolveSubjectsByStudyGrouped } from './identifier-resolution'
import { getDefaultExportConfiguration } from './settings'
import { buildContainerInfoMap } from './container-enrichment'

type StudyType = InferSelectModel<typeof study>

export interface ExportFilters {
  study: string
  specimen_type_ids?: number[]
  container_types?: string[]
  date_from?: string
  date_to?: string
  created_from?: string
  created_to?: string
  subject_ids?: number[]
  date_tolerance?: number  // Global tolerance for all exact dates (defaults to 0)
  subject_dates?: {  // Per-subject date filtering
    [subjectId: number]: 
      | { exact: string }  // Exact date match (tolerance applied from date_tolerance)
      | { from?: string, to?: string }  // Date range
  }
}

export interface ContainerExportData {
  container_id: number
  container_type: string
  barcode?: string
  position?: string
  label?: string
  collection_name?: string
  state: string
  status: string
  comment?: string
  specimen_id: number
  specimen_type: string
  collection_date?: string
  subject_id?: number
  subject_name?: string
  control_batch_id?: number
  control_batch_name?: string
  control_definition_name?: string
  control_type?: string
  target_density?: number
  target_density_unit?: string
  strain_composition?: string
  study_id: number
  study_title: string
  study_code: string
  study_lead_person?: string
  location_path?: string
  location_id?: number
  location_name?: string
  created: string
  last_updated: string
}

export interface CSVExportOptions {
  delimiter?: string  // Default: ','
  includeBOM?: boolean  // Default: true
  lineEnding?: 'LF' | 'CRLF'  // Default: 'CRLF'
}

// Build the base query with all necessary joins
export async function buildContainerQuery(database: Database, filters: ExportFilters) {
  // First, get the study and its subjects
  const studyRecord = await database
    .select()
    .from(study)
    .where(eq(study.shortCode, filters.study))
    .get()

  if (!studyRecord) {
    throw new Error(`Study with short code '${filters.study}' not found`)
  }

  // Get subject IDs for this study
  const subjects = await database
    .select({ id: studySubject.id })
    .from(studySubject)
    .where(eq(studySubject.studyId, studyRecord.id))

  const subjectIds = subjects.map(s => s.id)

  // If filtering by specific subjects, intersect
  let filteredSubjectIds = subjectIds
  if (filters.subject_ids && filters.subject_ids.length > 0) {
    filteredSubjectIds = subjectIds.filter(id => filters.subject_ids!.includes(id))
  }

  if (filteredSubjectIds.length === 0) {
    return { containers: [], study: studyRecord, specimens: [] }
  }

  // Build conditions for specimen query
  const specimenConditions: any[] = []
  specimenConditions.push(
    sql`${specimen.studySubjectId} IS NOT NULL` as any
  )

  if (filteredSubjectIds.length === 1) {
    specimenConditions.push(
      eq(specimen.studySubjectId, filteredSubjectIds[0])
    )
  } else {
    specimenConditions.push(
      inArray(specimen.studySubjectId, filteredSubjectIds)
    )
  }

  if (filters.specimen_type_ids && filters.specimen_type_ids.length > 0) {
    specimenConditions.push(
      inArray(specimen.specimenTypeId, filters.specimen_type_ids)
    )
  }

  // Handle per-subject date filtering
  if (filters.subject_dates && Object.keys(filters.subject_dates).length > 0) {
    const tolerance = filters.date_tolerance || 0
    const subjectDateConditions: any[] = []
    
    // Build conditions for each subject with date filters
    for (const [subjectIdStr, dateFilter] of Object.entries(filters.subject_dates)) {
      const subjectId = parseInt(subjectIdStr)
      if (isNaN(subjectId) || !filteredSubjectIds.includes(subjectId)) continue
      
      const subjectConditions: any[] = [eq(specimen.studySubjectId, subjectId)]
      
      if ('exact' in dateFilter) {
        // Convert exact date with tolerance to range
        const exactDate = dateFilter.exact
        const fromDate = new Date(exactDate)
        fromDate.setDate(fromDate.getDate() - tolerance)
        const toDate = new Date(exactDate)
        toDate.setDate(toDate.getDate() + tolerance)
        
        subjectConditions.push(
          and(
            gte(specimen.collectionDate, fromDate.toISOString().split('T')[0]),
            lte(specimen.collectionDate, toDate.toISOString().split('T')[0])
          ) as any
        )
      } else if ('from' in dateFilter || 'to' in dateFilter) {
        // Date range
        if (dateFilter.from) {
          subjectConditions.push(gte(specimen.collectionDate, dateFilter.from))
        }
        if (dateFilter.to) {
          subjectConditions.push(lte(specimen.collectionDate, dateFilter.to))
        }
      }
      
      subjectDateConditions.push(and(...subjectConditions) as any)
    }
    
    // If we have per-subject date conditions, use them (OR for different subjects)
    if (subjectDateConditions.length > 0) {
      specimenConditions.push(or(...subjectDateConditions) as any)
    }
  } else {
    // Use global date filters if no per-subject dates
    if (filters.date_from) {
      specimenConditions.push(
        gte(specimen.collectionDate, filters.date_from)
      )
    }

    if (filters.date_to) {
      specimenConditions.push(
        lte(specimen.collectionDate, filters.date_to)
      )
    }
  }

  // Get matching specimens
  const specimens = await database
    .select({
      id: specimen.id,
      studySubjectId: specimen.studySubjectId,
      controlBatchId: specimen.controlBatchId,
      specimenTypeId: specimen.specimenTypeId,
      collectionDate: specimen.collectionDate,
      created: specimen.created,
    })
    .from(specimen)
    .where(and(...specimenConditions) as any)

  const specimenIds = specimens.map(s => s.id)
  if (specimenIds.length === 0) {
    return { containers: [], study: studyRecord }
  }

  // Build conditions for container query
  const containerConditions: any[] = []
  containerConditions.push(inArray(storageContainer.specimenId, specimenIds))

  if (filters.created_from) {
    containerConditions.push(gte(storageContainer.created, filters.created_from))
  }

  if (filters.created_to) {
    containerConditions.push(lte(storageContainer.created, filters.created_to))
  }

  // Get matching containers
  const containers = await database
    .select()
    .from(storageContainer)
    .where(and(...containerConditions) as any)

  return { containers, study: studyRecord, specimens }
}

/**
 * Resolve micronix barcodes to container IDs
 * Only queries micronix_tube table (barcodes are globally unique)
 */
export async function resolveMicronixBarcodesToContainers(
  database: Database,
  barcodes: string[]
): Promise<Map<string, number>> {
  const uniqueBarcodes = [...new Set(barcodes.filter(b => b && b.trim()))]
  if (uniqueBarcodes.length === 0) return new Map()

  const micronixTubes = await database
    .select({ id: micronixTube.id, barcode: micronixTube.barcode })
    .from(micronixTube)
    .where(inArray(micronixTube.barcode, uniqueBarcodes))

  const result = new Map<string, number>()
  for (const tube of micronixTubes) {
    if (tube.barcode) {
      result.set(tube.barcode, tube.id)
    }
  }

  return result
}

/**
 * Build container query by micronix container IDs (multi-study support)
 */
export async function buildContainerQueryByMicronixBarcodes(
  database: Database,
  containerIds: number[]
): Promise<{
  containers: Array<typeof storageContainer.$inferSelect>
  specimens: Array<{ id: number; studySubjectId: number | null; controlBatchId: number | null; specimenTypeId: number; collectionDate: string | null; created: string }>
  studies: StudyType[]
  subjectToStudyMap: Map<number, StudyType>
}> {
  if (containerIds.length === 0) {
    return { containers: [], specimens: [], studies: [], subjectToStudyMap: new Map() }
  }

  // Get containers
  const containers = await database
    .select()
    .from(storageContainer)
    .where(inArray(storageContainer.id, containerIds))

  if (containers.length === 0) {
    return { containers: [], specimens: [], studies: [], subjectToStudyMap: new Map() }
  }

  // Get specimens for these containers
  // specimenId can be null from DB; filter to numbers only
  const specimenIds = [...new Set(containers.map(c => c.specimenId).filter((id): id is number => typeof id === 'number'))]
  if (specimenIds.length === 0) {
    return { containers, specimens: [], studies: [], subjectToStudyMap: new Map() }
  }

  const specimens = await database
    .select({
      id: specimen.id,
      studySubjectId: specimen.studySubjectId,
      controlBatchId: specimen.controlBatchId,
      specimenTypeId: specimen.specimenTypeId,
      collectionDate: specimen.collectionDate,
      created: specimen.created,
    })
    .from(specimen)
    .where(inArray(specimen.id, specimenIds))

  // Get unique study IDs from subjects
  const subjectIds = [...new Set(specimens.filter(s => s.studySubjectId !== null).map(s => s.studySubjectId!))]
  const studies: StudyType[] = []
  const subjectToStudyMap = new Map<number, StudyType>()
  
  if (subjectIds.length > 0) {
    const subjects = await database
      .select({ id: studySubject.id, studyId: studySubject.studyId })
      .from(studySubject)
      .where(inArray(studySubject.id, subjectIds))

    const uniqueStudyIds = [...new Set(subjects.map(s => s.studyId))]
    if (uniqueStudyIds.length > 0) {
      const studyRecords = await database
        .select()
        .from(study)
        .where(inArray(study.id, uniqueStudyIds))
      studies.push(...studyRecords)
      
      // Build subject to study map
      const studyMap = new Map(studyRecords.map(s => [s.id, s]))
      for (const subject of subjects) {
        const studyRecord = studyMap.get(subject.studyId)
        if (studyRecord) {
          subjectToStudyMap.set(subject.id, studyRecord)
        }
      }
    }
  }

  return { containers, specimens, studies, subjectToStudyMap }
}

// Enrich container data with all relationships
export async function enrichContainerData(
  database: Database,
  containers: Array<typeof storageContainer.$inferSelect>,
  specimens: Array<{ id: number; studySubjectId: number | null; controlBatchId: number | null; specimenTypeId: number; collectionDate: string | null; created: string }>,
  study: StudyType,
  containerTypeFilter?: string[],
  subjectToStudyMap?: Map<number, StudyType>
): Promise<ContainerExportData[]> {
  // Create specimen lookup
  const specimenMap = new Map(specimens.map(s => [s.id, s]))
  
  // Get all unique IDs we need to look up
  const containerIds = containers.map(c => c.id)
  const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]

  // Batch fetch lookups
  const specimenTypes = await database.select().from(specimenType).where(inArray(specimenType.id, specimenTypeIds))

  // Create lookup maps
  const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))

  // Get subject information for all specimens
  const subjectIds = [...new Set(specimens.filter(s => s.studySubjectId !== null).map(s => s.studySubjectId!))]
  const subjects = subjectIds.length > 0
    ? await database
        .select({
          id: studySubject.id,
          name: studySubject.name,
        })
        .from(studySubject)
        .where(inArray(studySubject.id, subjectIds))
    : []
  const subjectMap = new Map(subjects.map(s => [s.id, s.name]))

  // Get control batch information for all specimens
  const controlBatchIds = [...new Set(specimens.filter(s => s.controlBatchId !== null).map(s => s.controlBatchId!))]
  const controlBatches = controlBatchIds.length > 0
    ? await database
        .select({
          id: controlBatch.id,
          name: controlBatch.name,
          controlDefinitionId: controlBatch.controlDefinitionId,
        })
        .from(controlBatch)
        .where(inArray(controlBatch.id, controlBatchIds))
    : []
  const controlBatchMap = new Map(controlBatches.map(cb => [cb.id, cb.name]))
  const controlBatchToDefinitionMap = new Map(controlBatches.map(cb => [cb.id, cb.controlDefinitionId]))

  // Get control definitions for these batches
  const controlDefinitionIds = [...new Set(Array.from(controlBatchToDefinitionMap.values()))]
  const controlDefinitions = controlDefinitionIds.length > 0
    ? await database
        .select({
          id: controlDefinition.id,
          name: controlDefinition.name,
          controlType: controlDefinition.controlType,
          properties: controlDefinition.properties,
          created: controlDefinition.created,
          lastUpdated: controlDefinition.lastUpdated,
        })
        .from(controlDefinition)
        .where(inArray(controlDefinition.id, controlDefinitionIds))
    : []
  const controlDefinitionMap = new Map(controlDefinitions.map(cd => [cd.id, cd]))

  // Get units for target density (extract from properties)
  const unitIds = new Set<number>()
  for (const cd of controlDefinitions) {
    const props = cd.properties as any
    if (props?.targetDensityUnitId) {
      unitIds.add(props.targetDensityUnitId)
    }
  }
  const unitsResult = unitIds.size > 0
    ? await database
        .select({
          id: unit.id,
          symbol: unit.symbol,
        })
        .from(unit)
        .where(inArray(unit.id, Array.from(unitIds)))
    : []
  const units = unitsResult as Array<{ id: number; symbol: string }>
  const unitMap = new Map<number, string>(units.map(u => [u.id, u.symbol]))

  // Get all strains for name lookup
  const allStrains = await database.select().from(strain)
  const strainNameMap = new Map(allStrains.map(s => [s.id, s.name]))
  
  // Build strain map from properties JSON: controlDefinitionId -> array of {name, percentage}
  const strainMap = new Map<number, Array<{ name: string; percentage: number }>>()
  for (const cd of controlDefinitions) {
    const props = cd.properties as any
    if (props?.strains && Array.isArray(props.strains)) {
      const strains = props.strains.map((s: any) => {
        if (typeof s === 'number') {
          return { name: strainNameMap.get(s) || `Strain ${s}`, percentage: 0 }
        }
        return {
          name: s.name || strainNameMap.get(s.id) || `Strain ${s.id}`,
          percentage: s.percentage || 0,
        }
      })
      if (strains.length > 0) {
        strainMap.set(cd.id, strains)
      }
    }
  }

  // Build control batch to definition map for quick lookup
  const batchToDefinitionMap = new Map<number, {
    id: number
    name: string
    controlType: string
    targetDensity: number | null
    targetDensityUnitId: number | null
    properties: unknown
    created: string
    lastUpdated: string
    unitSymbol?: string
    strainComposition?: string
  }>()
  for (const cb of controlBatches) {
    const def = controlDefinitionMap.get(cb.controlDefinitionId)
    if (def) {
      const props = def.properties as any
      const targetDensity = props?.targetDensity
      const targetDensityUnitId = props?.targetDensityUnitId
      const unitSymbol: string | undefined = targetDensityUnitId ? unitMap.get(targetDensityUnitId) : props?.targetDensityUnitSymbol
      const strains = strainMap.get(def.id)
      const strainComposition: string | undefined = strains && strains.length > 0
        ? strains.map(s => `${s.name} (${s.percentage}%)`).join('; ')
        : undefined
      
      batchToDefinitionMap.set(cb.id, {
        id: def.id,
        name: def.name,
        controlType: def.controlType,
        targetDensity: targetDensity || null,
        targetDensityUnitId: targetDensityUnitId || null,
        properties: def.properties,
        created: def.created,
        lastUpdated: def.lastUpdated,
        unitSymbol,
        strainComposition,
      })
    }
  }

  // Resolve placement (type, collection, position, location) via shared enrichment
  const containerInfoMap = await buildContainerInfoMap(database, containerIds)

  // Barcodes are not part of placement info — fetch only when needed for export columns
  const shouldQueryType = (type: string) => {
    if (!containerTypeFilter || containerTypeFilter.length === 0) return true
    return containerTypeFilter.includes(type)
  }

  const [micronixTubes, cryovialTubes, papers] = await Promise.all([
    shouldQueryType('micronix_tube')
      ? database.select({ id: micronixTube.id, barcode: micronixTube.barcode }).from(micronixTube).where(inArray(micronixTube.id, containerIds))
      : [],
    shouldQueryType('cryovial_tube')
      ? database.select({ id: cryovialTube.id, barcode: cryovialTube.barcode }).from(cryovialTube).where(inArray(cryovialTube.id, containerIds))
      : [],
    shouldQueryType('paper')
      ? database.select({ id: paper.id, barcode: paper.barcode }).from(paper).where(inArray(paper.id, containerIds))
      : [],
  ])

  const barcodeMap = new Map<number, string>()
  for (const tube of micronixTubes) {
    if (tube.barcode) barcodeMap.set(tube.id, tube.barcode)
  }
  for (const tube of cryovialTubes) {
    if (tube.barcode) barcodeMap.set(tube.id, tube.barcode)
  }
  for (const p of papers) {
    if (p.barcode) barcodeMap.set(p.id, p.barcode)
  }

  // Build enriched data
  const enriched: ContainerExportData[] = []

  for (const container of containers) {
    const spec = specimenMap.get(container.specimenId)
    if (!spec) continue

    const placement = containerInfoMap.get(container.id)
    const containerType = placement?.type ?? 'unknown'
    const barcode = barcodeMap.get(container.id)
    const position = placement?.position
    const collectionName =
      placement?.collectionName && placement.collectionName !== 'Unknown'
        ? placement.collectionName
        : undefined
    const locationPath = placement?.locationPath

    const subjectId = spec.studySubjectId || undefined
    const controlBatchId = spec.controlBatchId || undefined
    // For control batches, use control batch name as subject_name; otherwise use actual subject name
    const subjectName = subjectId 
      ? subjectMap.get(subjectId) 
      : controlBatchId 
        ? controlBatchMap.get(controlBatchId) 
        : undefined

    // Get control batch details if this is a control batch
    const controlBatchName = controlBatchId ? controlBatchMap.get(controlBatchId) : undefined
    const controlBatchDetails = controlBatchId ? batchToDefinitionMap.get(controlBatchId) : undefined
    const controlDefinitionName = controlBatchDetails?.name
    const controlType = controlBatchDetails?.controlType
    const targetDensity = controlBatchDetails?.targetDensity ?? undefined
    const targetDensityUnit = controlBatchDetails?.unitSymbol
    const strainComposition = controlBatchDetails?.strainComposition

    // Filter by container type if specified
    if (containerTypeFilter && containerTypeFilter.length > 0 && !containerTypeFilter.includes(containerType)) {
      continue
    }

    // Get study information - use subjectToStudyMap if provided (for multi-study), otherwise use the passed study
    // For control batches, we don't have a study, so use a placeholder or the passed study
    let containerStudy = study
    if (subjectToStudyMap && subjectId) {
      const subjectStudy = subjectToStudyMap.get(subjectId)
      if (subjectStudy) {
        containerStudy = subjectStudy
      }
    } else if (controlBatchId) {
      // For control batches, use a placeholder study object
      containerStudy = { 
        id: 0, 
        shortCode: 'CONTROL', 
        title: 'Control Batch', 
        description: null,
        leadPerson: '', 
        isLongitudinal: false, 
        created: '', 
        lastUpdated: '' 
      } as StudyType
    }

    enriched.push({
      container_id: container.id,
      container_type: containerType,
      barcode,
      position,
      collection_name: collectionName,
      state: '',
      status:
        container.remainingQuantity == null
          ? 'Unknown'
          : container.remainingQuantity > 0
            ? 'In Use'
            : 'Exhausted',
      comment: container.comment || undefined,
      specimen_id: spec.id,
      specimen_type: specimenTypeMap.get(spec.specimenTypeId) || '',
      collection_date: spec.collectionDate || undefined,
      subject_id: subjectId,
      subject_name: subjectName,
      control_batch_id: controlBatchId,
      control_batch_name: controlBatchName,
      control_definition_name: controlDefinitionName,
      control_type: controlType,
      target_density: targetDensity,
      target_density_unit: targetDensityUnit,
      strain_composition: strainComposition,
      study_id: containerStudy.id,
      study_title: containerStudy.title,
      study_code: containerStudy.shortCode,
      study_lead_person: containerStudy.leadPerson,
      location_path: locationPath,
      location_id: placement?.locationId,
      location_name: placement?.locationName,
      created: container.created,
      last_updated: container.lastUpdated,
    })
  }

  return enriched
}

// Filter containers by container type (used for count queries)
export async function filterContainersByType(
  database: Database,
  containerIds: number[],
  containerTypeFilter?: string[]
): Promise<number[]> {
  if (!containerTypeFilter || containerTypeFilter.length === 0) {
    return containerIds
  }

  // Query each container type table to see which containers match
  const [micronixTubes, cryovialTubes, papers, staticWells] = await Promise.all([
    containerTypeFilter.includes('micronix_tube') && containerIds.length > 0
      ? database.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.id, containerIds))
      : [],
    containerTypeFilter.includes('cryovial_tube') && containerIds.length > 0
      ? database.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.id, containerIds))
      : [],
    containerTypeFilter.includes('paper') && containerIds.length > 0
      ? database.select({ id: paper.id }).from(paper).where(inArray(paper.id, containerIds))
      : [],
    containerTypeFilter.includes('static_well') && containerIds.length > 0
      ? database.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.id, containerIds))
      : [],
  ])

  // Collect all matching container IDs
  const matchingIds = new Set<number>()
  if (containerTypeFilter.includes('micronix_tube')) {
    micronixTubes.forEach(t => matchingIds.add(t.id))
  }
  if (containerTypeFilter.includes('cryovial_tube')) {
    cryovialTubes.forEach(t => matchingIds.add(t.id))
  }
  if (containerTypeFilter.includes('paper')) {
    papers.forEach(p => matchingIds.add(p.id))
  }
  if (containerTypeFilter.includes('static_well')) {
    staticWells.forEach(w => matchingIds.add(w.id))
  }

  return Array.from(matchingIds)
}

// Helper function to format simple CSV data (for simple endpoints)
export function formatSimpleCSV(
  headers: string[],
  rows: any[][],
  options?: CSVExportOptions
): string {
  // Set defaults for CSV options
  const delimiter = options?.delimiter ?? ','
  const includeBOM = options?.includeBOM ?? true
  const lineEnding = options?.lineEnding ?? 'CRLF'
  const newline = lineEnding === 'CRLF' ? '\r\n' : '\n'

  // Define date fields that should be date-only (YYYY-MM-DD)
  const dateOnlyFields = new Set(['collection_date'])
  
  // Define timestamp fields that should be full ISO 8601 datetime
  const timestampFields = new Set(['created', 'last_updated'])
  
  // Define fields that should NEVER be formatted as text (these are actual numbers)
  const numericFields = new Set([
    'count',
    'target_density',
    'remaining_quantity',
  ])
  
  // Define fields that should ALWAYS be formatted as text (IDs, codes, etc.)
  const alwaysTextFields = new Set([
    'id',
    'subject_id',
    'control_batch_id',
    'specimen_type',
  ])

  // Helper function to format a cell value
  const formatCellValue = (header: string, value: any): string => {
    if (value === null || value === undefined || value === '') {
      return ''
    }

    // Format dates
    if (dateOnlyFields.has(header)) {
      // User-facing dates: ISO 8601 date format (YYYY-MM-DD) only
      if (typeof value === 'string') {
        // If already in YYYY-MM-DD format, use directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value
        }
        // If in ISO datetime format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ), extract date part
        // This avoids timezone conversion issues that could shift the date
        const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})(T|\s|$)/)
        if (isoDateMatch) {
          return isoDateMatch[1]
        }
        // Otherwise parse and format (handles other date formats)
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      } else if (value instanceof Date) {
        return value.toISOString().split('T')[0]
      }
      return String(value)
    } else if (timestampFields.has(header)) {
      // System-generated timestamps: Full ISO 8601 datetime
      if (typeof value === 'string') {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
      } else if (value instanceof Date) {
        return value.toISOString()
      }
      return String(value)
    }

    // Format as string
    const stringValue = String(value)
    
    // Skip text formatting for numeric fields
    if (numericFields.has(header)) {
      return stringValue
    }
    
    // Always format these fields as text
    if (alwaysTextFields.has(header)) {
      // If it looks like a number (all digits), format for Excel to preserve leading zeros
      if (/^\d+$/.test(stringValue)) {
        return `="${stringValue}"`
      }
      // Otherwise, return as-is (will be quoted later)
      return stringValue
    }
    
    // For other fields, check if they look like numbers that should be preserved as text
    // This handles cases where IDs or codes might be numeric but should remain as text
    if (/^\d+$/.test(stringValue) && stringValue.length > 0) {
      // Format as text to preserve leading zeros and prevent Excel from converting to numbers
      return `="${stringValue}"`
    }
    
    return stringValue
  }

  // Format rows
  const formattedRows = rows.map(row =>
    headers.map((header, index) => formatCellValue(header, row[index]))
  )

  // Escape and quote cells
  const escapeCell = (cell: string): string => {
    // If already formatted as Excel text (="..."), we need to escape quotes inside
    // and wrap the entire cell in CSV quotes
    if (cell.startsWith('="') && cell.endsWith('"')) {
      // Escape any quotes inside the Excel-formatted value
      // The cell is ="value", we need to escape quotes in "value" part
      const innerValue = cell.slice(2, -1) // Remove =" and trailing " to get the inner value
      const escaped = innerValue.replace(/"/g, '""')
      // Wrap the entire Excel-formatted cell in CSV quotes
      // ="value" becomes "=""value"""
      // We need: opening CSV quote + = + opening Excel quote (escaped) + value + closing Excel quote + escaped CSV quote + closing CSV quote
      return '"=""' + escaped + '"""'
    }
    // Regular cell - escape quotes and wrap in quotes
    return `"${cell.replace(/"/g, '""')}"`
  }

  const csvRows = [
    headers.map(escapeCell).join(delimiter),
    ...formattedRows.map(row => row.map(escapeCell).join(delimiter))
  ]

  const csvContent = csvRows.join(newline)
  
  // Add UTF-8 BOM if requested
  return includeBOM ? '\uFEFF' + csvContent : csvContent
}

// Format as CSV
export async function formatAsCSV(
  database: Database,
  data: ContainerExportData[],
  columns?: string[],
  options?: CSVExportOptions,
  userId?: number | null
): Promise<string> {
  if (data.length === 0) {
    return ''
  }

  // Set defaults for CSV options
  const delimiter = options?.delimiter ?? ','
  const includeBOM = options?.includeBOM ?? true
  const lineEnding = options?.lineEnding ?? 'CRLF'
  const newline = lineEnding === 'CRLF' ? '\r\n' : '\n'

  // Define date fields that should be date-only (YYYY-MM-DD)
  const dateOnlyFields = new Set(['collection_date'])
  
  // Define timestamp fields that should be full ISO 8601 datetime
  const timestampFields = new Set(['created', 'last_updated'])
  
  // Define fields that should NEVER be formatted as text (these are actual numbers)
  const numericFields = new Set([
    'target_density',
    'remaining_quantity',
  ])
  
  // Define fields that should ALWAYS be formatted as text (IDs, codes, etc.)
  const alwaysTextFields = new Set([
    'barcode',
    'position',
    'container_id',
    'specimen_id',
    'subject_id',
    'study_code',
    'control_batch_id',
    'location_id',
    'study_id',
    'label',
    'subject_name',
    'control_batch_name',
    'control_definition_name',
    'specimen_type',
    'container_type',
    'state',
    'status',
    'comment',
    'collection_name',
    'location_path',
    'location_name',
    'study_title',
    'study_lead_person',
    'control_type',
    'target_density_unit',
    'strain_composition',
  ])

  // Helper function to format a cell value
  const formatCellValue = (header: string, value: any): string => {
    if (value === null || value === undefined) {
      return ''
    }

    // Format dates
    if (dateOnlyFields.has(header)) {
      // User-facing dates: ISO 8601 date format (YYYY-MM-DD) only
      if (typeof value === 'string') {
        // If already in YYYY-MM-DD format, use directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value
        }
        // If in ISO datetime format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ), extract date part
        // This avoids timezone conversion issues that could shift the date
        const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})(T|\s|$)/)
        if (isoDateMatch) {
          return isoDateMatch[1]
        }
        // Otherwise parse and format (handles other date formats)
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      } else if (value instanceof Date) {
        return value.toISOString().split('T')[0]
      }
      return String(value)
    } else if (timestampFields.has(header)) {
      // System-generated timestamps: Full ISO 8601 datetime
      if (typeof value === 'string') {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
      } else if (value instanceof Date) {
        return value.toISOString()
      }
      return String(value)
    }

    // Format as string
    const stringValue = String(value)
    
    // Skip text formatting for numeric fields
    if (numericFields.has(header)) {
      return stringValue
    }
    
    // Always format these fields as text
    if (alwaysTextFields.has(header)) {
      // If it looks like a number (all digits), format for Excel to preserve leading zeros
      if (/^\d+$/.test(stringValue)) {
        return `="${stringValue}"`
      }
      // Otherwise, return as-is (will be quoted later)
      return stringValue
    }
    
    // For other fields, check if they look like numbers that should be preserved as text
    // This handles cases where IDs or codes might be numeric but should remain as text
    if (/^\d+$/.test(stringValue) && stringValue.length > 0) {
      // Format as text to preserve leading zeros and prevent Excel from converting to numbers
      return `="${stringValue}"`
    }
    
    return stringValue
  }

  let headers: string[]
  const availableKeys = Object.keys(data[0])

  // If columns are explicitly provided, use them
  if (columns && columns.length > 0) {
    headers = columns.filter(col => availableKeys.includes(col))
    if (headers.length === 0) {
      // No valid columns provided, fall back to all columns
      headers = availableKeys
    }
  } else {
    // No columns specified, use default configuration
    const defaultConfig = await getDefaultExportConfiguration(database, userId)
    const defaultColumns = defaultConfig?.columns ?? []
    if (defaultColumns.length > 0) {
      headers = defaultColumns.filter(col => availableKeys.includes(col))
      if (headers.length === 0) headers = availableKeys
    } else {
      headers = availableKeys
    }
  }

  const rows = data.map(row => 
    headers.map(header => {
      const value = (row as any)[header]
      return formatCellValue(header, value)
    })
  )

  // Escape and quote cells
  const escapeCell = (cell: string): string => {
    // If already formatted as Excel text (="..."), we need to escape quotes inside
    // and wrap the entire cell in CSV quotes
    if (cell.startsWith('="') && cell.endsWith('"')) {
      // Escape any quotes inside the Excel-formatted value
      // The cell is ="value", we need to escape quotes in "value" part
      const innerValue = cell.slice(2, -1) // Remove =" and trailing " to get the inner value
      const escaped = innerValue.replace(/"/g, '""')
      // Wrap the entire Excel-formatted cell in CSV quotes
      // ="value" becomes "=""value"""
      // We need: opening CSV quote + = + opening Excel quote (escaped) + value + closing Excel quote + escaped CSV quote + closing CSV quote
      return '"=""' + escaped + '"""'
    }
    // Regular cell - escape quotes and wrap in quotes
    return `"${cell.replace(/"/g, '""')}"`
  }

  const csvRows = [
    headers.map(escapeCell).join(delimiter),
    ...rows.map(row => row.map(escapeCell).join(delimiter))
  ]

  const csvContent = csvRows.join(newline)
  
  // Add UTF-8 BOM if requested
  return includeBOM ? '\uFEFF' + csvContent : csvContent
}

// Format as JSON
export async function formatAsJSON(
  database: Database,
  data: ContainerExportData[],
  filters: ExportFilters,
  study: StudyType,
  columns?: string[],
  userId?: number | null
): Promise<{
  export_metadata: {
    study: string
    study_title: string
    filters: ExportFilters
    exported_at: string
    count: number
  }
  containers: ContainerExportData[]
}> {
  let filteredData = data

  // If columns are explicitly provided, use them
  if (columns && columns.length > 0) {
    const availableKeys = Object.keys(data[0] || {})
    const validColumns = columns.filter(col => availableKeys.includes(col))
    if (validColumns.length > 0) {
      filteredData = data.map(row => {
        const filtered: any = {}
        for (const col of validColumns) {
          filtered[col] = (row as any)[col]
        }
        return filtered as ContainerExportData
      })
    }
  } else {
    const defaultConfig = await getDefaultExportConfiguration(database, userId)
    const defaultColumns = defaultConfig?.columns ?? []
    if (defaultColumns.length > 0) {
      const availableKeys = Object.keys(data[0] || {})
      const validColumns = defaultColumns.filter(col => availableKeys.includes(col))
      if (validColumns.length > 0) {
        filteredData = data.map(row => {
          const filtered: any = {}
          for (const col of validColumns) {
            filtered[col] = (row as any)[col]
          }
          return filtered as ContainerExportData
        })
      }
    }
  }

  return {
    export_metadata: {
      study: study.shortCode,
      study_title: study.title,
      filters,
      exported_at: new Date().toISOString(),
      count: filteredData.length,
    },
    containers: filteredData,
  }
}

// Format as Excel (XLSX)
export async function formatAsExcel(
  database: Database,
  data: ContainerExportData[],
  columns?: string[],
  userId?: number | null
): Promise<Buffer> {
  // Dynamic import to avoid loading xlsx if not needed
  const XLSX = await import('xlsx')
  
  if (data.length === 0) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['No data to export']])
    XLSX.utils.book_append_sheet(wb, ws, 'Containers')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  let headers: string[]
  const availableKeys = Object.keys(data[0])

  // If columns are explicitly provided, use them
  if (columns && columns.length > 0) {
    headers = columns.filter(col => availableKeys.includes(col))
    if (headers.length === 0) {
      // No valid columns provided, fall back to all columns
      headers = availableKeys
    }
  } else {
    const defaultConfig = await getDefaultExportConfiguration(database, userId)
    const defaultColumns = defaultConfig?.columns ?? []
    if (defaultColumns.length > 0) {
      headers = defaultColumns.filter(col => availableKeys.includes(col))
      if (headers.length === 0) headers = availableKeys
    } else {
      headers = availableKeys
    }
  }

  // Convert data to worksheet format
  const rows = data.map(row => 
    headers.map(header => {
      const value = (row as any)[header]
      return value !== null && value !== undefined ? value : ''
    })
  )

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Set column widths (auto-size based on content)
  const colWidths = headers.map((_, colIndex) => {
    const maxLength = Math.max(
      headers[colIndex].length,
      ...rows.map(row => String(row[colIndex] || '').length)
    )
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }
  })
  ws['!cols'] = colWidths

  // Create workbook and add worksheet
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Containers')

  // Write to buffer
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// Track results per subject and build summary
export interface ExportSummary {
  total_containers: number
  subjects_with_results: Array<{ name: string; count: number }>
  subjects_no_results: string[]  // Subject names with no matching containers
  subjects_not_found: string[]  // Subject names not found in study
  errors?: string[]  // Any other errors
}

export async function buildExportSummary(
  enrichedData: ContainerExportData[],
  requestedSubjectNames: string[],
  subjectNameToId: Map<string, number>,
  subjectIdToName: Map<number, string>
): Promise<ExportSummary> {
  const summary: ExportSummary = {
    total_containers: enrichedData.length,
    subjects_with_results: [],
    subjects_no_results: [],
    subjects_not_found: [],
  }

  // Count containers per subject
  const subjectCounts = new Map<number, number>()
  for (const container of enrichedData) {
    if (container.subject_id) {
      const count = subjectCounts.get(container.subject_id) || 0
      subjectCounts.set(container.subject_id, count + 1)
    }
  }

  // Build subjects_with_results
  for (const [subjectId, count] of subjectCounts.entries()) {
    const subjectName = subjectIdToName.get(subjectId)
    if (subjectName) {
      summary.subjects_with_results.push({ name: subjectName, count })
    }
  }

  // Identify subjects not found
  for (const subjectName of requestedSubjectNames) {
    if (!subjectNameToId.has(subjectName)) {
      summary.subjects_not_found.push(subjectName)
    }
  }

  // Identify subjects with no results (found but no containers)
  for (const subjectName of requestedSubjectNames) {
    const subjectId = subjectNameToId.get(subjectName)
    if (subjectId && !subjectCounts.has(subjectId)) {
      summary.subjects_no_results.push(subjectName)
    }
  }

  return summary
}

// Validate study codes
export async function validateStudyCodes(database: Database, studyCodes: string[]): Promise<{
  valid: Map<string, number>  // studyCode -> studyId
  invalid: string[]  // Invalid study codes
  studies: Map<number, StudyType>  // studyId -> study record
}> {
  const uniqueCodes = [...new Set(studyCodes)]
  const valid = new Map<string, number>()
  const invalid: string[] = []
  const studies = new Map<number, StudyType>()
  
  for (const code of uniqueCodes) {
    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.shortCode, code))
      .get()
    
    if (studyRecord) {
      valid.set(code, studyRecord.id)
      studies.set(studyRecord.id, studyRecord)
    } else {
      invalid.push(code)
    }
  }
  
  return { valid, invalid, studies }
}

// Multi-study container query builder
export interface MultiStudyExportEntry {
  study_short_code: string
  subject_name: string
  collection_date?: string
  date_from?: string
  date_to?: string
}

export interface MultiStudyExportResult {
  containers: ContainerExportData[]
  studies: Map<number, StudyType>
  summary: MultiStudyExportSummary
}

export interface MultiStudyExportSummary {
  total_containers: number
  studies: Array<{
    study_code: string
    study_title: string
    study_lead_person: string
    containers: number
    subjects_with_results: Array<{ name: string; count: number }>
    subjects_no_results: string[]
    subjects_not_found: string[]
  }>
  invalid_study_codes: string[]
  errors?: string[]
}

export async function buildMultiStudyContainerQuery(
  database: Database,
  entries: MultiStudyExportEntry[],
  filters: Omit<ExportFilters, 'study' | 'subject_ids' | 'subject_dates'>,
  dateTolerance: number = 0
): Promise<MultiStudyExportResult> {
  // Validate all study codes
  const studyCodes = entries.map(e => e.study_short_code)
  const validation = await validateStudyCodes(database, studyCodes)
  
  if (validation.invalid.length > 0) {
    // Return early with invalid study codes
    return {
      containers: [],
      studies: validation.studies,
      summary: {
        total_containers: 0,
        studies: [],
        invalid_study_codes: validation.invalid,
        errors: [`Invalid study codes: ${validation.invalid.join(', ')}`],
      },
    }
  }
  
  // Group entries by study
  const entriesByStudy = new Map<number, MultiStudyExportEntry[]>()
  for (const entry of entries) {
    const studyId = validation.valid.get(entry.study_short_code)
    if (studyId) {
      if (!entriesByStudy.has(studyId)) {
        entriesByStudy.set(studyId, [])
      }
      entriesByStudy.get(studyId)!.push(entry)
    }
  }
  
  // Resolve subjects for each study
  const subjectResolutionEntries: Array<{ studyId: number; subjectName: string }> = []
  for (const [studyId, studyEntries] of entriesByStudy.entries()) {
    for (const entry of studyEntries) {
      subjectResolutionEntries.push({ studyId, subjectName: entry.subject_name })
    }
  }
  
  const subjectsByStudy = await resolveSubjectsByStudyGrouped(database, subjectResolutionEntries)
  
  // Build subject dates map (by study and subject name)
  const subjectDatesByStudy = new Map<number, Map<string, { exact?: string; from?: string; to?: string }>>()
  for (const [studyId, studyEntries] of entriesByStudy.entries()) {
    const datesMap = new Map<string, { exact?: string; from?: string; to?: string }>()
    for (const entry of studyEntries) {
      if (entry.collection_date) {
        datesMap.set(entry.subject_name, { exact: entry.collection_date })
      } else if (entry.date_from || entry.date_to) {
        datesMap.set(entry.subject_name, {
          from: entry.date_from,
          to: entry.date_to,
        })
      }
    }
    if (datesMap.size > 0) {
      subjectDatesByStudy.set(studyId, datesMap)
    }
  }
  
  // Process each study separately
  const allContainers: ContainerExportData[] = []
  const studySummaries: MultiStudyExportSummary['studies'] = []
  
  for (const [studyId, studyEntries] of entriesByStudy.entries()) {
    const studyRecord = validation.studies.get(studyId)!
    const studyCode = studyRecord.shortCode
    const subjectMap = subjectsByStudy.get(studyId) || new Map()
    const subjectIds = Array.from(subjectMap.values())
    
    if (subjectIds.length === 0) {
      // No subjects found for this study
      studySummaries.push({
        study_code: studyCode,
        study_title: studyRecord.title,
        study_lead_person: studyRecord.leadPerson,
        containers: 0,
        subjects_with_results: [],
        subjects_no_results: [],
        subjects_not_found: studyEntries.map(e => e.subject_name),
      })
      continue
    }
    
    // Build filters for this study
    const studyFilters: ExportFilters = {
      study: studyCode,
      subject_ids: subjectIds,
      date_tolerance: dateTolerance,
      ...filters,
    }
    
    // Add subject dates if available
    const studySubjectDates = subjectDatesByStudy.get(studyId)
    if (studySubjectDates && studySubjectDates.size > 0) {
      studyFilters.subject_dates = {}
      for (const [subjectName, dateFilter] of studySubjectDates.entries()) {
        const subjectId = subjectMap.get(subjectName)
        if (subjectId) {
          studyFilters.subject_dates[subjectId] = dateFilter
        }
      }
    }
    
    // Query containers for this study
    const { containers, specimens } = await buildContainerQuery(database, studyFilters)
    
    // Apply container type filter if specified
    let filteredContainers = containers
    if (filters.container_types && filters.container_types.length > 0) {
      const containerIds = containers.map(c => c.id)
      const matchingIds = await filterContainersByType(database, containerIds, filters.container_types)
      filteredContainers = containers.filter(c => matchingIds.includes(c.id))
    }
    
    // Enrich container data
    const enrichedData = await enrichContainerData(
      database,
      filteredContainers,
      specimens || [],
      studyRecord,
      filters.container_types,
      undefined
    )
    
    allContainers.push(...enrichedData)
    
    // Build summary for this study
    const subjectIdToName = new Map<number, string>()
    for (const [name, id] of subjectMap.entries()) {
      subjectIdToName.set(id, name)
    }
    
    const studySummary = await buildExportSummary(
      enrichedData,
      studyEntries.map(e => e.subject_name),
      subjectMap,
      subjectIdToName
    )
    
    studySummaries.push({
      study_code: studyCode,
      study_title: studyRecord.title,
      study_lead_person: studyRecord.leadPerson,
      containers: enrichedData.length,
      subjects_with_results: studySummary.subjects_with_results,
      subjects_no_results: studySummary.subjects_no_results,
      subjects_not_found: studySummary.subjects_not_found,
    })
  }
  
  return {
    containers: allContainers,
    studies: validation.studies,
    summary: {
      total_containers: allContainers.length,
      studies: studySummaries,
      invalid_study_codes: validation.invalid,
    },
  }
}

