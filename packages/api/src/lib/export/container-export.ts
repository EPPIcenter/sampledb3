import { subjectDateSelections, type ContainerExportData } from '@sampledb/contract'
import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { study, studySubject } from '../../db/schema'
import { ExpectedNotFoundError, RouteError } from '../error-handler'
import { enrichContainerData } from './enrich'
import { filterContainerIdsByType } from './filter'
import { formatAsCSV, formatAsExcel, formatAsJSON } from './format'
import { buildContainerQuery, resolveMicronixBarcodesToContainers } from './query'
import { buildExportSummary, validateStudyCodes } from './validate'
import {
  resolveSubjectNamesByStudy,
  resolveStudyByShortCode,
  resolveSubjectsByStudyGrouped,
} from '../identifier-resolution'
import {
  selectContainers,
  type ContainerSelectionFilters,
  type SubjectSelectionEntry,
} from '../container-selection'
import { chunkArray, SQL_IN_CHUNK_SIZE } from '../sql-helpers'
import type {
  CSVExportOptions,
  ExportFilters,
  ExportSummary,
  MultiStudyExportEntry,
  MultiStudyExportSummary,
  StudyRecord,
} from './types'

export type ContainerExportFormat = 'csv' | 'xlsx' | 'json'

export function parseCSVExportOptions(params: {
  csv_delimiter?: ',' | ';' | '\t'
  csv_bom?: boolean | string
  csv_line_ending?: 'LF' | 'CRLF'
}): CSVExportOptions {
  return {
    delimiter: params.csv_delimiter ?? ',',
    bom: params.csv_bom !== false && params.csv_bom !== 'false',
    lineEnding: params.csv_line_ending === 'LF' ? 'lf' : 'crlf',
  }
}

export function formatExportTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

export interface PostExportEnvelope {
  summary: unknown
  data: unknown
  format: ContainerExportFormat
  filename: string
}

export function buildPostExportEnvelope(params: {
  format: ContainerExportFormat
  filenameBase: string
  summary: unknown
  jsonData?: ContainerExportData[]
  csv?: string
  xlsx?: Buffer
}): PostExportEnvelope {
  const { format, filenameBase, summary, jsonData, csv, xlsx } = params

  if (format === 'json') {
    return {
      summary,
      data: jsonData ?? [],
      format: 'json',
      filename: `${filenameBase}.json`,
    }
  }

  if (format === 'csv') {
    return {
      summary,
      data: Buffer.from(csv ?? '').toString('base64'),
      format: 'csv',
      filename: `${filenameBase}.csv`,
    }
  }

  return {
    summary,
    data: (xlsx ?? Buffer.from('')).toString('base64'),
    format: 'xlsx',
    filename: `${filenameBase}.xlsx`,
  }
}

async function formatContainerExport(
  database: Database,
  data: ContainerExportData[],
  format: ContainerExportFormat,
  filters: ExportFilters,
  study: StudyRecord,
  columns: string[] | undefined,
  csvOptions: CSVExportOptions | undefined,
  userId: number | null | undefined
): Promise<{ csv?: string; xlsx?: Buffer; jsonData?: ContainerExportData[] }> {
  if (format === 'json') {
    const json = await formatAsJSON(database, data, filters, study, columns, userId)
    return { jsonData: json.containers }
  }

  if (format === 'csv') {
    const csv = await formatAsCSV(database, data, columns, csvOptions, userId)
    return { csv }
  }

  const xlsx = await formatAsExcel(database, data, columns, userId)
  return { xlsx }
}

export async function runSingleStudyContainerExportGet(
  database: Database,
  params: {
    filters: ExportFilters
    format?: ContainerExportFormat
    columns?: string[]
    csvOptions?: CSVExportOptions
    userId?: number | null
    countOnly?: boolean
  }
): Promise<
  | { kind: 'count'; count: number }
  | { kind: 'csv'; csv: string; filename: string }
  | { kind: 'xlsx'; xlsx: Buffer; filename: string }
  | { kind: 'json'; json: Awaited<ReturnType<typeof formatAsJSON>>; filename: string }
> {
  const { filters, format, columns, csvOptions, userId, countOnly } = params
  let result
  try {
    result = await buildContainerQuery(database, filters)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Not found'
    throw new ExpectedNotFoundError(message)
  }

  if (countOnly) {
    let filteredContainers = result.containers
    if (filters.container_types?.length && filteredContainers.length > 0) {
      const containerIds = filteredContainers.map((c) => c.id)
      const matchingIds = await filterContainerIdsByType(database, containerIds, filters.container_types)
      filteredContainers = filteredContainers.filter((c) => matchingIds.includes(c.id))
    }
    return { kind: 'count', count: filteredContainers.length }
  }

  if (result.containers.length === 0) {
    throw new ExpectedNotFoundError('No containers found for this study')
  }

  const validFormats: ContainerExportFormat[] = ['csv', 'xlsx', 'json']
  if (!format || !validFormats.includes(format)) {
    throw new RouteError(400, { error: 'Invalid format. Use csv, xlsx, or json.' })
  }

  const enrichedData = await enrichContainerData(
    database,
    result.containers,
    result.specimens ?? [],
    result.study,
    filters.container_types,
    undefined
  )

  const timestamp = formatExportTimestamp()
  const filenameBase = `study_${result.study.shortCode}_export_${timestamp}`

  if (format === 'json') {
    const json = await formatAsJSON(database, enrichedData, filters, result.study, columns, userId)
    return { kind: 'json', json, filename: `${filenameBase}.json` }
  }

  if (format === 'csv') {
    const csv = await formatAsCSV(database, enrichedData, columns, csvOptions, userId)
    return { kind: 'csv', csv, filename: `${filenameBase}.csv` }
  }

  const xlsx = await formatAsExcel(database, enrichedData, columns, userId)
  return { kind: 'xlsx', xlsx, filename: `${filenameBase}.xlsx` }
}

export async function runSingleStudyContainerExportPost(
  database: Database,
  params: {
    studyCode: string
    subjectNames: string[]
    filters: Omit<ExportFilters, 'study' | 'subject_ids' | 'subject_dates'>
    format: ContainerExportFormat
    columns?: string[]
    csvOptions?: CSVExportOptions
    userId?: number | null
    countOnly?: boolean
    subjectDates?: ExportFilters['subject_dates']
    dateTolerance?: number
  }
): Promise<PostExportEnvelope | { count: number; summary: ExportSummary }> {
  const {
    studyCode,
    subjectNames,
    filters,
    format,
    columns,
    csvOptions,
    userId,
    countOnly,
    subjectDates,
    dateTolerance = 0,
  } = params

  const studyId = await resolveStudyByShortCode(database, studyCode)
  if (!studyId) {
    throw new ExpectedNotFoundError('Study not found')
  }

  const subjectNameToId = await resolveSubjectNamesByStudy(database, subjectNames, studyId)
  const subjectIds = Array.from(subjectNameToId.values())
  const subjectIdToName = new Map<number, string>()
  for (const [name, id] of subjectNameToId.entries()) {
    subjectIdToName.set(id, name)
  }

  if (subjectIds.length === 0) {
    const summary: ExportSummary = {
      total_containers: 0,
      subjects_with_results: [],
      subjects_no_results: [],
      subjects_not_found: subjectNames,
      errors: [],
    }

    if (countOnly) {
      return { count: 0, summary }
    }

    return buildPostExportEnvelope({
      format,
      filenameBase: `study_${studyCode}_export_${formatExportTimestamp()}`,
      summary,
      jsonData: [],
      csv: '',
      xlsx: Buffer.from(''),
    })
  }

  const queryFilters: ExportFilters = {
    ...filters,
    study: studyCode,
    subject_ids: subjectIds,
    date_tolerance: dateTolerance,
  }

  if (subjectDates) {
    queryFilters.subject_dates = {}
    for (const [subjectName, dateFilter] of Object.entries(subjectDates)) {
      const subjectId = subjectNameToId.get(subjectName)
      if (subjectId) {
        queryFilters.subject_dates![subjectId] = dateFilter as NonNullable<ExportFilters['subject_dates']>[number]
      }
    }
  }

  const result = await buildContainerQuery(database, queryFilters).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Not found'
    throw new ExpectedNotFoundError(message)
  })

  if (countOnly) {
    let filteredContainers = result.containers
    if (queryFilters.container_types?.length) {
      const containerIds = result.containers.map((c) => c.id)
      const matchingIds = await filterContainerIdsByType(database, containerIds, queryFilters.container_types)
      filteredContainers = result.containers.filter((c) => matchingIds.includes(c.id))
    }

    const summary: ExportSummary = {
      total_containers: filteredContainers.length,
      subjects_with_results: [],
      subjects_no_results: [],
      subjects_not_found: subjectNames.filter((name) => !subjectNameToId.has(name)),
      errors: [],
    }

    return { count: filteredContainers.length, summary }
  }

  const enrichedData = await enrichContainerData(
    database,
    result.containers,
    result.specimens ?? [],
    result.study,
    queryFilters.container_types,
    undefined
  )

  const summary = await buildExportSummary(
    enrichedData,
    subjectNames,
    subjectNameToId,
    subjectIdToName
  )

  const formatted = await formatContainerExport(
    database,
    enrichedData,
    format,
    queryFilters,
    result.study,
    columns,
    csvOptions,
    userId
  )

  return buildPostExportEnvelope({
    format,
    filenameBase: `study_${result.study.shortCode}_export_${formatExportTimestamp()}`,
    summary,
    ...formatted,
  })
}

/** Placeholder study for export metadata when an export spans Studies or has none (ADR 0011). */
const MULTI_STUDY_RECORD: StudyRecord = {
  id: 0,
  shortCode: 'MULTI',
  title: 'Multi-Study Export',
  description: null,
  leadPerson: '',
  isLongitudinal: false,
  created: '',
  lastUpdated: '',
  createdBy: null,
  updatedBy: null,
}

/** Container selection filters for an export's filters; `created_*` means Container created (ADR 0011). */
function exportSelectionFilters(
  filters: Omit<ExportFilters, 'study' | 'subject_ids' | 'subject_dates'>
): ContainerSelectionFilters {
  return {
    specimenTypeIds: filters.specimen_type_ids,
    collectionDate: { from: filters.date_from, to: filters.date_to },
    containerCreated: { from: filters.created_from, to: filters.created_to },
    containerTypes: filters.container_types,
    tagIds: filters.tag_ids,
  }
}

export async function runMultiStudyContainerExportPost(
  database: Database,
  params: {
    entries: MultiStudyExportEntry[]
    filters: Omit<ExportFilters, 'study' | 'subject_ids' | 'subject_dates'>
    format: ContainerExportFormat
    columns?: string[]
    csvOptions?: CSVExportOptions
    userId?: number | null
    countOnly?: boolean
    dateTolerance?: number
  }
): Promise<PostExportEnvelope | { count: number; summary: MultiStudyExportSummary }> {
  const { entries, filters, format, columns, csvOptions, userId, countOnly, dateTolerance = 0 } = params
  const filenameBase = `multi_study_export_${formatExportTimestamp()}`

  const validation = await validateStudyCodes(
    database,
    entries.map((entry) => entry.study_short_code)
  )
  if (validation.invalid.length > 0) {
    const summary: MultiStudyExportSummary = {
      total_containers: 0,
      studies: [],
      invalid_study_codes: validation.invalid,
      errors: [`Invalid study codes: ${validation.invalid.join(', ')}`],
    }
    if (countOnly) return { count: 0, summary }
    const formatted = await formatContainerExport(
      database,
      [],
      format,
      { study: 'MULTI' },
      MULTI_STUDY_RECORD,
      columns,
      csvOptions,
      userId
    )
    return buildPostExportEnvelope({ format, filenameBase, summary, ...formatted })
  }

  const entriesByStudy = new Map<number, MultiStudyExportEntry[]>()
  for (const entry of entries) {
    const studyId = validation.valid.get(entry.study_short_code)!
    entriesByStudy.set(studyId, [...(entriesByStudy.get(studyId) ?? []), entry])
  }
  const subjectsByStudy = await resolveSubjectsByStudyGrouped(
    database,
    entries.map((entry) => ({
      studyId: validation.valid.get(entry.study_short_code)!,
      subjectName: entry.subject_name,
    }))
  )

  // The whole upload is one subject-list selection. A Subject listed without a date matches
  // every collection date.
  const subjects: SubjectSelectionEntry[] = []
  const subjectToStudyMap = new Map<number, StudyRecord>()
  for (const [studyId, studyEntries] of entriesByStudy) {
    const subjectIds = subjectsByStudy.get(studyId) ?? new Map<string, number>()
    for (const [subjectName, selection] of subjectDateSelections(studyEntries)) {
      const subjectId = subjectIds.get(subjectName)
      if (subjectId === undefined) continue
      subjects.push({ studyId, subjectId, dates: selection.kind === 'dates' ? selection.filters : undefined })
      subjectToStudyMap.set(subjectId, validation.studies.get(studyId)!)
    }
  }

  const selected =
    subjects.length > 0
      ? await selectContainers(database, {
          kind: 'subjects',
          subjects,
          dateTolerance,
          filters: exportSelectionFilters(filters),
        })
      : { containers: [], specimens: [] }
  const enrichedData = await enrichContainerData(
    database,
    selected.containers,
    selected.specimens,
    MULTI_STUDY_RECORD,
    undefined,
    subjectToStudyMap
  )

  // The Export summary groups the one selection by Study.
  const studySummaries: MultiStudyExportSummary['studies'] = []
  for (const [studyId, studyEntries] of entriesByStudy) {
    const studyRecord = validation.studies.get(studyId)!
    const subjectNameToId = subjectsByStudy.get(studyId) ?? new Map<string, number>()
    const subjectIdToName = new Map([...subjectNameToId].map(([name, id]) => [id, name]))
    const studyData = enrichedData.filter((row) => row.study_id === studyId)
    const studySummary = await buildExportSummary(
      studyData,
      studyEntries.map((entry) => entry.subject_name),
      subjectNameToId,
      subjectIdToName
    )
    studySummaries.push({
      study_code: studyRecord.shortCode,
      study_title: studyRecord.title,
      study_lead_person: studyRecord.leadPerson,
      containers: studyData.length,
      subjects_with_results: studySummary.subjects_with_results,
      subjects_no_results: studySummary.subjects_no_results,
      subjects_not_found: studySummary.subjects_not_found,
    })
  }
  const summary: MultiStudyExportSummary = {
    total_containers: enrichedData.length,
    studies: studySummaries,
    invalid_study_codes: [],
  }

  if (countOnly) {
    return { count: enrichedData.length, summary }
  }

  const formatted = await formatContainerExport(
    database,
    enrichedData,
    format,
    { study: 'MULTI' },
    validation.studies.values().next().value ?? MULTI_STUDY_RECORD,
    columns,
    csvOptions,
    userId
  )

  return buildPostExportEnvelope({ format, filenameBase, summary, ...formatted })
}

/** Each Subject's Study, by Subject id. */
async function loadStudiesBySubject(
  database: Database,
  subjectIds: number[]
): Promise<Map<number, StudyRecord>> {
  const studiesBySubject = new Map<number, StudyRecord>()
  for (const chunk of chunkArray([...new Set(subjectIds)], SQL_IN_CHUNK_SIZE)) {
    const rows = await database
      .select({ subjectId: studySubject.id, study })
      .from(studySubject)
      .innerJoin(study, eq(studySubject.studyId, study.id))
      .where(inArray(studySubject.id, chunk))
    for (const row of rows) studiesBySubject.set(row.subjectId, row.study)
  }
  return studiesBySubject
}

export async function runBarcodeContainerExportPost(
  database: Database,
  params: {
    barcodes: string[]
    format: ContainerExportFormat
    columns?: string[]
    csvOptions?: CSVExportOptions
    userId?: number | null
  }
): Promise<PostExportEnvelope> {
  const { barcodes, format, columns, csvOptions, userId } = params
  // Selected Containers carry no barcode, so found and not found come from the tubes.
  const barcodeToContainerId = await resolveMicronixBarcodesToContainers(database, barcodes)
  const foundBarcodes = Array.from(barcodeToContainerId.keys())

  const selected = await selectContainers(database, { kind: 'micronixBarcodes', barcodes: foundBarcodes })
  const studiesBySubject = await loadStudiesBySubject(
    database,
    selected.specimens.flatMap((row) => (row.studySubjectId == null ? [] : [row.studySubjectId]))
  )
  const enrichedData = await enrichContainerData(
    database,
    selected.containers,
    selected.specimens,
    MULTI_STUDY_RECORD,
    undefined,
    studiesBySubject
  )

  const formatted = await formatContainerExport(
    database,
    enrichedData,
    format,
    { study: 'MULTI' },
    studiesBySubject.values().next().value ?? MULTI_STUDY_RECORD,
    columns,
    csvOptions,
    userId
  )

  return buildPostExportEnvelope({
    format,
    filenameBase: `barcode_export_${formatExportTimestamp()}`,
    summary: {
      total_containers: enrichedData.length,
      barcodes_found: foundBarcodes,
      barcodes_not_found: barcodes.filter((barcode) => !barcodeToContainerId.has(barcode)),
    },
    ...formatted,
  })
}

export async function runValidateStudyCodesExport(
  database: Database,
  studyCodes: string[]
) {
  const validation = await validateStudyCodes(database, studyCodes)
  return {
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
  }
}
