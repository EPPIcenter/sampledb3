import type { Database } from '../../db/client'
import {
  storageContainer,
  specimen,
  studySubject,
  study,
  micronixTube,
} from '../../db/schema'
import { eq, and, or, inArray, gte, lte, sql } from 'drizzle-orm'
import { resolveSubjectsByStudyGrouped } from '../identifier-resolution'
import { resolveContainerIdsWithAllTags } from '../container-tag-filter'
import { enrichContainerData } from './enrich'
import { filterContainerIdsByType } from './filter'
import type { SubjectDateFilter } from '@sampledb/contract'
import type {
  ContainerExportData,
  ExportFilters,
  MultiStudyExportEntry,
  MultiStudyExportResult,
  MultiStudyExportSummary,
  StudyRecord,
} from './types'
import { buildExportSummary, validateStudyCodes } from './validate'
import { chunkArray, dateToUpperBound } from '../statistics/helpers'

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
    const subjectDates = filters.subject_dates
    const subjectDateConditions: any[] = []
    const undatedSubjectIds: number[] = []

    for (const subjectId of filteredSubjectIds) {
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
      subjectDateConditions.push(and(eq(specimen.studySubjectId, subjectId), or(...dateConditions)))
    }

    if (undatedSubjectIds.length > 0) {
      subjectDateConditions.push(
        and(
          inArray(specimen.studySubjectId, undatedSubjectIds),
          ...(filters.date_from ? [gte(specimen.collectionDate, filters.date_from)] : []),
          ...(filters.date_to ? [lte(specimen.collectionDate, filters.date_to)] : []),
        ),
      )
    }

    specimenConditions.push(or(...subjectDateConditions) as any)
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

  if (filters.created_from) {
    containerConditions.push(gte(storageContainer.created, filters.created_from))
  }

  if (filters.created_to) {
    containerConditions.push(dateToUpperBound(storageContainer.created, filters.created_to))
  }

  // Get matching containers, chunking specimen ids to stay under SQLite's parameter limit
  let containers: Array<typeof storageContainer.$inferSelect> = []
  for (const idChunk of chunkArray(specimenIds, 5000)) {
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
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateFilter.exact)
    if (!match) return eq(specimen.collectionDate, dateFilter.exact)
    const shift = (days: number) =>
      new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)).toISOString().slice(0, 10)
    return and(
      gte(specimen.collectionDate, shift(-toleranceDays)),
      lte(specimen.collectionDate, shift(toleranceDays)),
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
  
  // Build subject dates map (by study and subject name)
  // A subject may appear on several rows (one per visit); keep every date. A row without
  // a date means all of that subject's dates, so it wins over dated rows.
  const subjectDatesByStudy = new Map<number, Map<string, SubjectDateFilter[] | 'all'>>()
  for (const [studyId, studyEntries] of entriesByStudy.entries()) {
    const datesMap = new Map<string, SubjectDateFilter[] | 'all'>()
    for (const entry of studyEntries) {
      const existing = datesMap.get(entry.subject_name)
      if (existing === 'all') continue
      const dateFilter: SubjectDateFilter | null = entry.collection_date
        ? { exact: entry.collection_date }
        : entry.date_from || entry.date_to
          ? { from: entry.date_from, to: entry.date_to }
          : null
      datesMap.set(entry.subject_name, dateFilter ? [...(existing ?? []), dateFilter] : 'all')
    }
    if ([...datesMap.values()].some((v) => v !== 'all')) {
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
      for (const [subjectName, dateFilters] of studySubjectDates.entries()) {
        const subjectId = subjectMap.get(subjectName)
        if (subjectId && dateFilters !== 'all') {
          studyFilters.subject_dates[subjectId] = dateFilters
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


