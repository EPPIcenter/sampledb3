import { db } from '../db/client'
import {
  storageContainer,
  specimen,
  specimenType,
  studySubject,
  study,
  state,
  location,
  micronixTube,
  micronixPlate,
  cryovialTube,
  cryovialBox,
  tube,
  box,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, inArray, gte, lte, sql } from 'drizzle-orm'

export interface ExportFilters {
  study: string
  specimen_type_ids?: number[]
  container_types?: string[]
  date_from?: string
  date_to?: string
  created_from?: string
  created_to?: string
  state_ids?: number[]
  subject_ids?: number[]
}

export interface ContainerExportData {
  container_id: number
  container_type: string
  barcode?: string
  position?: string
  state: string
  status: string
  comment?: string
  specimen_id: number
  specimen_type: string
  collection_date?: string
  subject_id?: number
  subject_name?: string
  study_id: number
  study_title: string
  study_code: string
  location_path?: string
  location_root?: string
  location_level_i?: string
  location_level_ii?: string
  location_level_iii?: string
  created: string
  last_updated: string
}

// Helper to build location path string
function buildLocationPath(loc: any | null): string | undefined {
  if (!loc) return undefined
  const parts = [loc.locationRoot, loc.levelI, loc.levelII]
  if (loc.levelIII) parts.push(loc.levelIII)
  return parts.filter(Boolean).join(' → ')
}

// Build the base query with all necessary joins
export async function buildContainerQuery(filters: ExportFilters) {
  // First, get the study and its subjects
  const studyRecord = await db
    .select()
    .from(study)
    .where(eq(study.shortCode, filters.study))
    .get()

  if (!studyRecord) {
    return { containers: [], study: null }
  }

  // Get subject IDs for this study
  const subjects = await db
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
    return { containers: [], study: studyRecord }
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

  // Get matching specimens
  const specimens = await db
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

  if (filters.state_ids && filters.state_ids.length > 0) {
    containerConditions.push(inArray(storageContainer.stateId, filters.state_ids))
  }

  // Get matching containers
  const containers = await db
    .select()
    .from(storageContainer)
    .where(and(...containerConditions) as any)

  return { containers, study: studyRecord, specimens }
}

// Enrich container data with all relationships
export async function enrichContainerData(
  containers: any[],
  specimens: any[],
  study: any,
  containerTypeFilter?: string[]
): Promise<ContainerExportData[]> {
  // Create specimen lookup
  const specimenMap = new Map(specimens.map(s => [s.id, s]))
  
  // Get all unique IDs we need to look up
  const containerIds = containers.map(c => c.id)
  const specimenTypeIds = [...new Set(specimens.map(s => s.specimenTypeId))]
  const stateIds = [...new Set(containers.map(c => c.stateId))]

  // Batch fetch lookups
  const [specimenTypes, states] = await Promise.all([
    db.select().from(specimenType).where(inArray(specimenType.id, specimenTypeIds)),
    db.select().from(state).where(inArray(state.id, stateIds)),
  ])

  // Create lookup maps
  const specimenTypeMap = new Map(specimenTypes.map(st => [st.id, st.name]))
  const stateMap = new Map(states.map(s => [s.id, s.name]))

  // Get subject information for all specimens
  const subjectIds = [...new Set(specimens.filter(s => s.studySubjectId).map(s => s.studySubjectId))]
  const subjects = subjectIds.length > 0
    ? await db
        .select({
          id: studySubject.id,
          name: studySubject.name,
        })
        .from(studySubject)
        .where(inArray(studySubject.id, subjectIds))
    : []
  const subjectMap = new Map(subjects.map(s => [s.id, s.name]))

  // Get container type information - only query types we need if filter is specified
  const shouldQueryType = (type: string) => !containerTypeFilter || containerTypeFilter.includes(type)
  
  const [micronixTubes, cryovialTubes, tubes, papers, staticWells] = await Promise.all([
    shouldQueryType('micronix_tube') ? db.select().from(micronixTube).where(inArray(micronixTube.id, containerIds)) : [],
    shouldQueryType('cryovial_tube') ? db.select().from(cryovialTube).where(inArray(cryovialTube.id, containerIds)) : [],
    shouldQueryType('tube') ? db.select().from(tube).where(inArray(tube.id, containerIds)) : [],
    shouldQueryType('paper') ? db.select().from(paper).where(inArray(paper.id, containerIds)) : [],
    shouldQueryType('static_well') ? db.select().from(staticWell).where(inArray(staticWell.id, containerIds)) : [],
  ])

  // Create container type maps
  const micronixMap = new Map(micronixTubes.map(t => [t.id, { type: 'micronix_tube', barcode: t.barcode, position: t.position, manifestId: t.manifestId }]))
  const cryovialMap = new Map(cryovialTubes.map(t => [t.id, { type: 'cryovial_tube', barcode: t.barcode, position: t.position, manifestId: t.manifestId }]))
  const tubeMap = new Map(tubes.map(t => [t.id, { type: 'tube', position: t.boxPosition, label: t.label, boxId: t.boxId }]))
  const paperMap = new Map(papers.map(p => [p.id, { type: 'paper', barcode: p.barcode, position: p.position, sheetId: p.sheetId }]))
  const staticWellMap = new Map(staticWells.map(w => [w.id, { type: 'static_well', position: w.position, manifestId: w.manifestId }]))

  // Get location information for manifests
  const manifestIds = new Set<number>()
  micronixTubes.forEach(t => manifestIds.add(t.manifestId))
  cryovialTubes.forEach(t => manifestIds.add(t.manifestId))
  tubes.forEach(t => manifestIds.add(t.boxId))

  const [micronixPlates, cryovialBoxes, boxes] = await Promise.all([
    manifestIds.size > 0 ? db.select().from(micronixPlate).where(inArray(micronixPlate.id, Array.from(manifestIds))) : [],
    manifestIds.size > 0 ? db.select().from(cryovialBox).where(inArray(cryovialBox.id, Array.from(manifestIds))) : [],
    manifestIds.size > 0 ? db.select().from(box).where(inArray(box.id, Array.from(manifestIds))) : [],
  ])

  const locationIds = new Set<number>()
  micronixPlates.forEach(p => locationIds.add(p.locationId))
  cryovialBoxes.forEach(b => locationIds.add(b.locationId))
  boxes.forEach(b => locationIds.add(b.locationId))

  const locations = locationIds.size > 0
    ? await db.select().from(location).where(inArray(location.id, Array.from(locationIds)))
    : []
  const locationMap = new Map(locations.map(l => [l.id, l]))

  // Create manifest to location map
  const manifestLocationMap = new Map<number, any>()
  micronixPlates.forEach(p => manifestLocationMap.set(p.id, locationMap.get(p.locationId)))
  cryovialBoxes.forEach(b => manifestLocationMap.set(b.id, locationMap.get(b.locationId)))
  boxes.forEach(b => manifestLocationMap.set(b.id, locationMap.get(b.locationId)))

  // Build enriched data
  const enriched: ContainerExportData[] = []

  for (const container of containers) {
    const spec = specimenMap.get(container.specimenId)
    if (!spec) continue

    // Determine container type and metadata
    let containerType = 'unknown'
    let barcode: string | undefined
    let position: string | undefined
    let locationInfo: any = null

    if (micronixMap.has(container.id)) {
      const info = micronixMap.get(container.id)!
      containerType = info.type
      barcode = info.barcode || undefined
      position = info.position || undefined
      locationInfo = manifestLocationMap.get(info.manifestId)
    } else if (cryovialMap.has(container.id)) {
      const info = cryovialMap.get(container.id)!
      containerType = info.type
      barcode = info.barcode || undefined
      position = info.position || undefined
      locationInfo = manifestLocationMap.get(info.manifestId)
    } else if (tubeMap.has(container.id)) {
      const info = tubeMap.get(container.id)!
      containerType = info.type
      position = info.position || undefined
      locationInfo = manifestLocationMap.get(info.boxId)
    } else if (paperMap.has(container.id)) {
      const info = paperMap.get(container.id)!
      containerType = info.type
      barcode = info.barcode || undefined
      position = info.position || undefined
    } else if (staticWellMap.has(container.id)) {
      const info = staticWellMap.get(container.id)!
      containerType = info.type
      position = info.position || undefined
      locationInfo = manifestLocationMap.get(info.manifestId)
    }

    const subjectId = spec.studySubjectId || undefined
    const subjectName = subjectId ? subjectMap.get(subjectId) : undefined

    // Filter by container type if specified
    if (containerTypeFilter && containerTypeFilter.length > 0 && !containerTypeFilter.includes(containerType)) {
      continue
    }

    enriched.push({
      container_id: container.id,
      container_type: containerType,
      barcode,
      position,
      state: stateMap.get(container.stateId) || '',
      status: container.remainingQuantity > 0 ? 'In Use' : 'Exhausted',
      comment: container.comment || undefined,
      specimen_id: spec.id,
      specimen_type: specimenTypeMap.get(spec.specimenTypeId) || '',
      collection_date: spec.collectionDate || undefined,
      subject_id: subjectId,
      subject_name: subjectName,
      study_id: study.id,
      study_title: study.title,
      study_code: study.shortCode,
      location_path: buildLocationPath(locationInfo),
      location_root: locationInfo?.locationRoot,
      location_level_i: locationInfo?.levelI,
      location_level_ii: locationInfo?.levelII,
      location_level_iii: locationInfo?.levelIII,
      created: container.created,
      last_updated: container.lastUpdated,
    })
  }

  return enriched
}

// Filter containers by container type (used for count queries)
export async function filterContainersByType(
  containerIds: number[],
  containerTypeFilter?: string[]
): Promise<number[]> {
  if (!containerTypeFilter || containerTypeFilter.length === 0) {
    return containerIds
  }

  // Query each container type table to see which containers match
  const [micronixTubes, cryovialTubes, tubes, papers, staticWells] = await Promise.all([
    containerTypeFilter.includes('micronix_tube') && containerIds.length > 0
      ? db.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.id, containerIds))
      : [],
    containerTypeFilter.includes('cryovial_tube') && containerIds.length > 0
      ? db.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.id, containerIds))
      : [],
    containerTypeFilter.includes('tube') && containerIds.length > 0
      ? db.select({ id: tube.id }).from(tube).where(inArray(tube.id, containerIds))
      : [],
    containerTypeFilter.includes('paper') && containerIds.length > 0
      ? db.select({ id: paper.id }).from(paper).where(inArray(paper.id, containerIds))
      : [],
    containerTypeFilter.includes('static_well') && containerIds.length > 0
      ? db.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.id, containerIds))
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
  if (containerTypeFilter.includes('tube')) {
    tubes.forEach(t => matchingIds.add(t.id))
  }
  if (containerTypeFilter.includes('paper')) {
    papers.forEach(p => matchingIds.add(p.id))
  }
  if (containerTypeFilter.includes('static_well')) {
    staticWells.forEach(w => matchingIds.add(w.id))
  }

  return Array.from(matchingIds)
}

// Format as CSV
export function formatAsCSV(data: ContainerExportData[]): string {
  if (data.length === 0) {
    return ''
  }

  const headers = Object.keys(data[0])
  const rows = data.map(row => 
    headers.map(header => {
      const value = (row as any)[header]
      return value !== null && value !== undefined ? String(value) : ''
    })
  )

  const csvRows = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ]

  return csvRows.join('\n')
}

// Format as JSON
export function formatAsJSON(
  data: ContainerExportData[],
  filters: ExportFilters,
  study: any
): any {
  return {
    export_metadata: {
      study: study.shortCode,
      study_title: study.title,
      filters,
      exported_at: new Date().toISOString(),
      count: data.length,
    },
    containers: data,
  }
}

// Format as Excel (XLSX)
export async function formatAsExcel(data: ContainerExportData[]): Promise<Buffer> {
  // Dynamic import to avoid loading xlsx if not needed
  const XLSX = await import('xlsx')
  
  if (data.length === 0) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['No data to export']])
    XLSX.utils.book_append_sheet(wb, ws, 'Containers')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  // Convert data to worksheet format
  const headers = Object.keys(data[0])
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

