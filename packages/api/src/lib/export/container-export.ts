import {
  addSubjectDates,
  subjectDateSelections,
  type ContainerExportData,
  type SubjectDateFilter,
  type SubjectDateSelection,
} from '@sampledb/contract'
import type { Database } from '../../db/client'
import {
  containerTypesFilter,
  selectContainers,
  type ContainerSelection,
  type ContainerSelectionFilters,
  type SubjectSelectionEntry,
} from '../container-selection'
import { ExpectedNotFoundError, RouteError } from '../error-handler'
import { enrichContainerData } from './enrich'
import { formatAsCSV, formatAsExcel, formatAsJSON } from './format'
import { resolveMicronixBarcodesToContainers } from './query'
import { buildExportSummary, validateStudyCodes } from './validate'
import {
  resolveStudyRecordByShortCode,
  resolveSubjectNamesByStudy,
  resolveSubjectsByStudyGrouped,
} from '../identifier-resolution'
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

/**
 * Container selection filters for an export request (ADR 0011). Export's
 * `created_from`/`created_to` mean Container created.
 */
function exportSelectionFilters(filters: Omit<ExportFilters, 'study'>): ContainerSelectionFilters {
  return {
    specimenTypeIds: filters.specimen_type_ids,
    collectionDate: { from: filters.date_from, to: filters.date_to },
    containerCreated: { from: filters.created_from, to: filters.created_to },
    containerTypes: containerTypesFilter(filters.container_types),
    tagIds: filters.tag_ids,
  }
}

/** A Subject's dates for a subject-list selection; undefined when it selects all of them. */
function subjectDateFilters(selection: SubjectDateSelection): SubjectDateFilter[] | undefined {
  return selection.kind === 'dates' ? selection.filters : undefined
}

/** Subject names by Subject id, inverting a name to id map. */
function subjectNamesById(subjectIdsByName: ReadonlyMap<string, number>): Map<number, string> {
  return new Map([...subjectIdsByName].map(([name, id]) => [id, name]))
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

/** The filters and Study a JSON export records in its metadata. */
interface JsonExportMetadata {
  filters: ExportFilters
  study: StudyRecord
}

/** JSON export metadata for an export that spans Studies or has none. */
const MULTI_STUDY_METADATA: JsonExportMetadata = { filters: { study: 'MULTI' }, study: MULTI_STUDY_RECORD }

type FormattedContainerExport =
  | { kind: 'json'; json: Awaited<ReturnType<typeof formatAsJSON>> }
  | { kind: 'csv'; csv: string }
  | { kind: 'xlsx'; xlsx: Buffer }

async function formatContainerExport(
  database: Database,
  data: ContainerExportData[],
  params: {
    format: ContainerExportFormat
    columns: string[] | undefined
    csvOptions: CSVExportOptions | undefined
    userId: number | null | undefined
    /** Defaults to the multi-study placeholder. */
    metadata?: JsonExportMetadata
  }
): Promise<FormattedContainerExport> {
  const { format, columns, csvOptions, userId, metadata = MULTI_STUDY_METADATA } = params
  if (format === 'json') {
    const json = await formatAsJSON(database, data, metadata.filters, metadata.study, columns, userId)
    return { kind: 'json', json }
  }

  if (format === 'csv') {
    return { kind: 'csv', csv: await formatAsCSV(database, data, columns, csvOptions, userId) }
  }

  return { kind: 'xlsx', xlsx: await formatAsExcel(database, data, columns, userId) }
}

/** A formatted export's data, as `buildPostExportEnvelope` takes it. */
function postEnvelopeData(
  formatted: FormattedContainerExport,
): { jsonData?: ContainerExportData[]; csv?: string; xlsx?: Buffer } {
  switch (formatted.kind) {
    case 'json':
      return { jsonData: formatted.json.containers }
    case 'csv':
      return { csv: formatted.csv }
    case 'xlsx':
      return { xlsx: formatted.xlsx }
  }
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
): Promise<{ kind: 'count'; count: number } | (FormattedContainerExport & { filename: string })> {
  const { filters, format, columns, csvOptions, userId, countOnly } = params
  const studyRecord = await resolveStudyRecordByShortCode(database, filters.study)
  if (!studyRecord) {
    throw new ExpectedNotFoundError(`Study with short code '${filters.study}' not found`)
  }

  const selectionFilters = exportSelectionFilters(filters)
  const selection: ContainerSelection = filters.subject_ids?.length
    ? {
        kind: 'subjects',
        subjects: filters.subject_ids.map((subjectId) => ({ studyId: studyRecord.id, subjectId })),
        filters: selectionFilters,
      }
    : { kind: 'study', studyId: studyRecord.id, filters: selectionFilters }
  const result = await selectContainers(database, selection)

  if (countOnly) {
    return { kind: 'count', count: result.containers.length }
  }

  if (result.containers.length === 0) {
    throw new ExpectedNotFoundError('No containers found for this study')
  }

  const validFormats: ContainerExportFormat[] = ['csv', 'xlsx', 'json']
  if (!format || !validFormats.includes(format)) {
    throw new RouteError(400, { error: 'Invalid format. Use csv, xlsx, or json.' })
  }

  const enrichedData = await enrichContainerData(database, result.containers)
  const formatted = await formatContainerExport(database, enrichedData, {
    format,
    columns,
    csvOptions,
    userId,
    metadata: { filters, study: studyRecord },
  })
  const filenameBase = `study_${studyRecord.shortCode}_export_${formatExportTimestamp()}`
  return { ...formatted, filename: `${filenameBase}.${formatted.kind}` }
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
    /** Per-Subject collection dates, keyed by subject name. A null entry means undated. */
    subjectDates?: Record<string, SubjectDateFilter | SubjectDateFilter[] | null>
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

  const studyRecord = await resolveStudyRecordByShortCode(database, studyCode)
  if (!studyRecord) {
    throw new ExpectedNotFoundError('Study not found')
  }

  const subjectNameToId = await resolveSubjectNamesByStudy(database, subjectNames, studyRecord.id)
  const subjectIdToName = subjectNamesById(subjectNameToId)

  if (subjectNameToId.size === 0) {
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

  const subjects: SubjectSelectionEntry[] = [...subjectNameToId].map(([name, subjectId]) => ({
    studyId: studyRecord.id,
    subjectId,
    dates: subjectDateFilters(addSubjectDates(undefined, subjectDates?.[name])),
  }))
  const result = await selectContainers(database, {
    kind: 'subjects',
    subjects,
    dateTolerance,
    filters: exportSelectionFilters(filters),
  })

  if (countOnly) {
    const summary: ExportSummary = {
      total_containers: result.containers.length,
      subjects_with_results: [],
      subjects_no_results: [],
      subjects_not_found: subjectNames.filter((name) => !subjectNameToId.has(name)),
      errors: [],
    }

    return { count: result.containers.length, summary }
  }

  const enrichedData = await enrichContainerData(database, result.containers)

  const summary = await buildExportSummary(
    enrichedData,
    subjectNames,
    subjectNameToId,
    subjectIdToName
  )

  const formatted = await formatContainerExport(database, enrichedData, {
    format,
    columns,
    csvOptions,
    userId,
    metadata: { filters: { ...filters, study: studyCode, date_tolerance: dateTolerance }, study: studyRecord },
  })

  return buildPostExportEnvelope({
    format,
    filenameBase: `study_${studyRecord.shortCode}_export_${formatExportTimestamp()}`,
    summary,
    ...postEnvelopeData(formatted),
  })
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
    const formatted = await formatContainerExport(database, [], { format, columns, csvOptions, userId })
    return buildPostExportEnvelope({ format, filenameBase, summary, ...postEnvelopeData(formatted) })
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
  for (const [studyId, studyEntries] of entriesByStudy) {
    const subjectIds = subjectsByStudy.get(studyId) ?? new Map<string, number>()
    for (const [subjectName, selection] of subjectDateSelections(studyEntries)) {
      const subjectId = subjectIds.get(subjectName)
      if (subjectId === undefined) continue
      subjects.push({ studyId, subjectId, dates: subjectDateFilters(selection) })
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
      : { containers: [] }
  const enrichedData = await enrichContainerData(database, selected.containers)

  // The Export summary groups the one selection by Study.
  const studySummaries: MultiStudyExportSummary['studies'] = []
  for (const [studyId, studyEntries] of entriesByStudy) {
    const studyRecord = validation.studies.get(studyId)!
    const subjectNameToId = subjectsByStudy.get(studyId) ?? new Map<string, number>()
    const subjectIdToName = subjectNamesById(subjectNameToId)
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

  const formatted = await formatContainerExport(database, enrichedData, { format, columns, csvOptions, userId })

  return buildPostExportEnvelope({ format, filenameBase, summary, ...postEnvelopeData(formatted) })
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
  const enrichedData = await enrichContainerData(database, selected.containers)

  const formatted = await formatContainerExport(database, enrichedData, { format, columns, csvOptions, userId })

  return buildPostExportEnvelope({
    format,
    filenameBase: `barcode_export_${formatExportTimestamp()}`,
    summary: {
      total_containers: enrichedData.length,
      barcodes_found: foundBarcodes,
      barcodes_not_found: barcodes.filter((barcode) => !barcodeToContainerId.has(barcode)),
    },
    ...postEnvelopeData(formatted),
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
