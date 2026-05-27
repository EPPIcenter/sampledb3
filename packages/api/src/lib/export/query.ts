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
import { enrichContainerData } from './enrich'
import { filterContainerIdsByType } from './filter'
import type {
  ContainerExportData,
  ExportFilters,
  MultiStudyExportEntry,
  MultiStudyExportResult,
  MultiStudyExportSummary,
  StudyRecord,
} from './types'
import { buildExportSummary, validateStudyCodes } from './validate'

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


