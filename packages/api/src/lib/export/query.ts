import type { Database } from '../../db/client'
import {
  storageContainer,
  specimen,
  studySubject,
  study,
  micronixTube,
} from '../../db/schema'
import { eq, and, or, inArray, gte, lte, sql, type SQL } from 'drizzle-orm'
import { resolveSubjectsByStudyGrouped } from '../identifier-resolution'
import { resolveContainerIdsWithAllTags } from '../container-tag-filter'
import { enrichContainerData } from './enrich'
import { filterContainerIdsByType } from './filter'
import { subjectDateSelections, type SubjectDateFilter, type SubjectDateSelection } from '@sampledb/contract'
import type {
  ContainerExportData,
  ExportFilters,
  MultiStudyExportEntry,
  MultiStudyExportResult,
  MultiStudyExportSummary,
  StudyRecord,
} from './types'
import { buildExportSummary, validateStudyCodes } from './validate'
import { chunkArray, dateToUpperBound, SQL_IN_CHUNK_SIZE } from '../sql-helpers'
import { shiftCalendarDate } from '../datetime'

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

  // A subject list (or per-subject dates) needs the study's subject ids; a whole-study export
  // selects them with a subquery instead of an id list.
  const studySubjectIds = database
    .select({ id: studySubject.id })
    .from(studySubject)
    .where(eq(studySubject.studyId, studyRecord.id))

  const subjectDates =
    filters.subject_dates && Object.keys(filters.subject_dates).length > 0 ? filters.subject_dates : undefined
  const listsSubjects = (filters.subject_ids && filters.subject_ids.length > 0) || subjectDates !== undefined

  let filteredSubjectIds: number[] = []
  if (listsSubjects) {
    filteredSubjectIds = (await studySubjectIds).map((s) => s.id)
    if (filters.subject_ids && filters.subject_ids.length > 0) {
      const requested = new Set(filters.subject_ids)
      filteredSubjectIds = filteredSubjectIds.filter((id) => requested.has(id))
    }
    if (filteredSubjectIds.length === 0) {
      return { containers: [], study: studyRecord, specimens: [] }
    }
  }

  const specimenConditions: SQL[] = [sql`${specimen.studySubjectId} IS NOT NULL`]
  if (filters.specimen_type_ids && filters.specimen_type_ids.length > 0) {
    specimenConditions.push(inArray(specimen.specimenTypeId, filters.specimen_type_ids))
  }
  const globalDateConditions = [
    ...(filters.date_from ? [gte(specimen.collectionDate, filters.date_from)] : []),
    ...(filters.date_to ? [lte(specimen.collectionDate, filters.date_to)] : []),
  ]

  /** Subject (and collection date) condition for one chunk of listed subjects. */
  const subjectChunkCondition = (subjectIds: number[]): SQL | undefined => {
    if (!subjectDates) return and(inArray(specimen.studySubjectId, subjectIds), ...globalDateConditions)
    const tolerance = filters.date_tolerance || 0
    const conditions: SQL[] = []
    const undatedSubjectIds: number[] = []
    for (const subjectId of subjectIds) {
      const entry = subjectDates[subjectId] as SubjectDateFilter | SubjectDateFilter[] | undefined
      const dateConditions = (entry == null ? [] : Array.isArray(entry) ? entry : [entry])
        .map((dateFilter) => subjectDateCondition(dateFilter, tolerance))
        .filter((condition) => condition != null)
      if (dateConditions.length === 0) {
        // Listed without a date: every collection date for this subject.
        undatedSubjectIds.push(subjectId)
        continue
      }
      // Several entries for one subject (one per visit) are alternatives.
      conditions.push(and(eq(specimen.studySubjectId, subjectId), or(...dateConditions))!)
    }
    if (undatedSubjectIds.length > 0) {
      conditions.push(and(inArray(specimen.studySubjectId, undatedSubjectIds), ...globalDateConditions)!)
    }
    return or(...conditions)
  }

  // Listed subjects are queried a chunk at a time, so neither the IN list nor the per-subject
  // OR grows with the upload.
  const subjectConditions = listsSubjects
    ? chunkArray(filteredSubjectIds, SQL_IN_CHUNK_SIZE).map(subjectChunkCondition)
    : [and(inArray(specimen.studySubjectId, studySubjectIds), ...globalDateConditions)]

  const specimens: Array<{
    id: number
    studySubjectId: number | null
    controlBatchId: number | null
    specimenTypeId: number
    collectionDate: string | null
    created: string
  }> = []
  for (const subjectCondition of subjectConditions) {
    specimens.push(
      ...(await database
        .select({
          id: specimen.id,
          studySubjectId: specimen.studySubjectId,
          controlBatchId: specimen.controlBatchId,
          specimenTypeId: specimen.specimenTypeId,
          collectionDate: specimen.collectionDate,
          created: specimen.created,
        })
        .from(specimen)
        .where(and(...specimenConditions, subjectCondition))),
    )
  }

  const specimenIds = specimens.map(s => s.id)
  if (specimenIds.length === 0) {
    return { containers: [], study: studyRecord }
  }

  // Build conditions for container query
  const containerConditions: any[] = []

  if (filters.created_from) {
    containerConditions.push(gte(storageContainer.created, filters.created_from))
  }

  if (filters.created_to) {
    containerConditions.push(dateToUpperBound(storageContainer.created, filters.created_to))
  }

  // Get matching containers, chunking specimen ids to stay under SQLite's parameter limit
  let containers: Array<typeof storageContainer.$inferSelect> = []
  for (const idChunk of chunkArray(specimenIds, SQL_IN_CHUNK_SIZE)) {
    containers.push(
      ...(await database
        .select()
        .from(storageContainer)
        .where(and(inArray(storageContainer.specimenId, idChunk), ...containerConditions) as any)),
    )
  }

  if (filters.tag_ids && filters.tag_ids.length > 0) {
    const matchingIds = new Set(await resolveContainerIdsWithAllTags(database, filters.tag_ids))
    if (matchingIds.size === 0) {
      return { containers: [], study: studyRecord, specimens: [] }
    }
    containers = containers.filter((container) => matchingIds.has(container.id))
  }

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
  studies: StudyRecord[]
  subjectToStudyMap: Map<number, StudyRecord>
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
  const studies: StudyRecord[] = []
  const subjectToStudyMap = new Map<number, StudyRecord>()
  
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

/** Collection date condition for one per-subject filter (exact date +/- tolerance days, or a range). */
function subjectDateCondition(dateFilter: SubjectDateFilter, toleranceDays: number) {
  if ('exact' in dateFilter) {
    const from = shiftCalendarDate(dateFilter.exact, -toleranceDays)
    const to = shiftCalendarDate(dateFilter.exact, toleranceDays)
    if (!from || !to) return eq(specimen.collectionDate, dateFilter.exact)
    return and(
      gte(specimen.collectionDate, from),
      lte(specimen.collectionDate, to),
    )
  }
  const bounds = [
    ...(dateFilter.from ? [gte(specimen.collectionDate, dateFilter.from)] : []),
    ...(dateFilter.to ? [lte(specimen.collectionDate, dateFilter.to)] : []),
  ]
  return bounds.length > 0 ? and(...bounds) : null
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
  
  // Date selection per subject name, for studies where at least one subject is limited to some dates
  const subjectDatesByStudy = new Map<number, Map<string, SubjectDateSelection>>()
  for (const [studyId, studyEntries] of entriesByStudy.entries()) {
    const selections = subjectDateSelections(studyEntries)
    if ([...selections.values()].some((selection) => selection.kind === 'dates')) {
      subjectDatesByStudy.set(studyId, selections)
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
      for (const [subjectName, selection] of studySubjectDates.entries()) {
        const subjectId = subjectMap.get(subjectName)
        // Subjects with no entry match every date.
        if (subjectId && selection.kind === 'dates') {
          studyFilters.subject_dates[subjectId] = selection.filters
        }
      }
    }
    
    // Query containers for this study
    const { containers, specimens } = await buildContainerQuery(database, studyFilters)
    
    // Apply container type filter if specified
    let filteredContainers = containers
    if (filters.container_types && filters.container_types.length > 0) {
      const containerIds = containers.map(c => c.id)
      const matchingIds = await filterContainerIdsByType(database, containerIds, filters.container_types)
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


