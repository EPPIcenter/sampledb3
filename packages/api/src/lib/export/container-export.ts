import type { ContainerExportData } from '@sampledb/contract'
import type { Database } from '../../db/client'
import { ExpectedNotFoundError, RouteError } from '../error-handler'
import { enrichContainerData } from './enrich'
import { filterContainerIdsByType } from './filter'
import { formatAsCSV, formatAsExcel, formatAsJSON } from './format'
import { buildContainerQuery, buildContainerQueryByMicronixBarcodes, buildMultiStudyContainerQuery, resolveMicronixBarcodesToContainers } from './query'
import { buildExportSummary, validateStudyCodes } from './validate'
import { resolveSubjectNamesByStudy, resolveStudyByShortCode } from '../identifier-resolution'
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
    includeBOM: params.csv_bom !== false && params.csv_bom !== 'false',
    lineEnding: params.csv_line_ending ?? 'CRLF',
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
): Promise<{ csv?: string; xlsx?: Buffer; json?: ContainerExportData[] }> {
  if (format === 'json') {
    const json = await formatAsJSON(database, data, filters, study, columns, userId)
    return { json: json.containers }
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
  const result = await buildMultiStudyContainerQuery(database, entries, filters, dateTolerance)

  if (countOnly) {
    return { count: result.containers.length, summary: result.summary }
  }

  const firstStudy =
    result.studies.size > 0
      ? Array.from(result.studies.values())[0]
      : ({
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
        } as StudyRecord)

  const formatted = await formatContainerExport(
    database,
    result.containers,
    format,
    { study: 'MULTI' },
    firstStudy,
    columns,
    csvOptions,
    userId
  )

  return buildPostExportEnvelope({
    format,
    filenameBase: `multi_study_export_${formatExportTimestamp()}`,
    summary: result.summary,
    ...formatted,
  })
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
  const barcodeToContainerId = await resolveMicronixBarcodesToContainers(database, barcodes)
  const containerIds = Array.from(barcodeToContainerId.values())
  const foundBarcodes = Array.from(barcodeToContainerId.keys())
  const notFoundBarcodes = barcodes.filter((b) => !barcodeToContainerId.has(b))

  const summary = {
    total_containers: 0,
    barcodes_found: foundBarcodes,
    barcodes_not_found: notFoundBarcodes,
  }

  if (containerIds.length === 0) {
    return buildPostExportEnvelope({
      format,
      filenameBase: `barcode_export_${formatExportTimestamp()}`,
      summary,
      jsonData: [],
      csv: '',
      xlsx: Buffer.from(''),
    })
  }

  const queryResult = await buildContainerQueryByMicronixBarcodes(database, containerIds)
  if (queryResult.containers.length === 0) {
    return buildPostExportEnvelope({
      format,
      filenameBase: `barcode_export_${formatExportTimestamp()}`,
      summary,
      jsonData: [],
      csv: '',
      xlsx: Buffer.from(''),
    })
  }

  const firstStudy =
    queryResult.studies.length > 0
      ? queryResult.studies[0]
      : ({
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
        } as StudyRecord)

  const enrichedData = await enrichContainerData(
    database,
    queryResult.containers,
    queryResult.specimens,
    firstStudy,
    undefined,
    queryResult.subjectToStudyMap
  )

  summary.total_containers = enrichedData.length

  const formatted = await formatContainerExport(
    database,
    enrichedData,
    format,
    { study: 'MULTI' },
    firstStudy,
    columns,
    csvOptions,
    userId
  )

  return buildPostExportEnvelope({
    format,
    filenameBase: `barcode_export_${formatExportTimestamp()}`,
    summary,
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
