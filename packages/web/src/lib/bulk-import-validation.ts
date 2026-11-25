/**
 * Display and subjects-only helpers for the bulk import flow.
 * Template column definitions and CSV-to-request mapping live in @sampledb/contract.
 */
import {
  BULK_IMPORT_CONTAINER_TEMPLATES,
  getBulkImportOptionalColumns,
  getBulkImportRequiredColumns,
  getBulkImportRowCollectionRef as contractGetBulkImportRowCollectionRef,
  parseBulkImportTemplateCsv,
  type BulkImportCollectionRef,
  type BulkImportCollectionType,
  type BulkImportCsvRow,
  type BulkImportTemplateError,
} from '@sampledb/contract'
import type { ContainerType } from './container-types'

export type CSVRow = BulkImportCsvRow
export type { BulkImportCollectionRef, BulkImportCollectionType }

/** An import error and the spreadsheet rows it concerns (header is row 1); none for a file-wide error. */
export interface BulkImportValidationError {
  fileRows: number[]
  error: string
}

/** "Row 3: …", "Rows 2, 5: …", or the bare message for a file-wide error. */
export function formatBulkImportError({ fileRows, error }: BulkImportValidationError): string {
  if (fileRows.length === 0) return error
  return `${fileRows.length === 1 ? 'Row' : 'Rows'} ${fileRows.join(', ')}: ${error}`
}

export function templateErrorsToValidationErrors(
  errors: readonly BulkImportTemplateError[],
): BulkImportValidationError[] {
  return errors.map((e) => ({
    fileRows: e.rowIndex != null ? [e.rowIndex] : [],
    error: e.message,
  }))
}

export type ImportType = 'subjects' | 'specimens' | 'combined'

export function getBulkImportCollectionType(
  containerType: ContainerType | 'none' | '',
): BulkImportCollectionType | null {
  if (!containerType || containerType === 'none') return null
  return BULK_IMPORT_CONTAINER_TEMPLATES[containerType].collectionTypes[0] ?? null
}

export function getBulkImportRequiredFields(opts: {
  importType: ImportType
  containerType: ContainerType | 'none' | ''
  fixedStudyShortCode?: string
}): string[] {
  const { importType, containerType, fixedStudyShortCode } = opts
  if (importType === 'subjects') {
    return fixedStudyShortCode ? ['subject_name'] : ['study_short_code', 'subject_name']
  }
  return getBulkImportRequiredColumns({
    containerType: containerType || 'none',
    defaultStudyShortCode: fixedStudyShortCode,
  })
}

export function getBulkImportOptionalFields(
  containerType: ContainerType | 'none' | '',
): string[] {
  if (!containerType || containerType === 'none') return []
  return [...getBulkImportOptionalColumns(containerType)]
}

export function parseBulkImportCSV(text: string): CSVRow[] {
  return parseBulkImportCsvFileRows(text).rows
}

/**
 * Parse bulk import CSV into header-keyed rows, dropping rows whose cells are all blank.
 * `fileRows[i]` is the spreadsheet row of `rows[i]`, counting the header as row 1.
 */
export function parseBulkImportCsvFileRows(text: string): { rows: CSVRow[]; fileRows: number[] } {
  const parsed = parseBulkImportTemplateCsv(text)
  return {
    rows: parsed.rows.map((r) => r.row),
    fileRows: parsed.rows.map((r) => r.fileRow),
  }
}

/** Per-row Collection reference for missing-collection resolution (supports mixed box/bag paper rows). */
export function getBulkImportRowCollectionRef(
  row: CSVRow,
  containerType: ContainerType | 'none' | '',
): BulkImportCollectionRef | undefined {
  if (!containerType || containerType === 'none') return undefined
  return contractGetBulkImportRowCollectionRef(row, containerType)
}

function trimCell(s: string | undefined): string {
  return (s ?? '').trim()
}

/** Parse and validate a subjects-only bulk import CSV. */
export function parseSubjectsBulkImportCsv(
  text: string,
  fixedStudyShortCode?: string,
):
  | { ok: true; subjects: Array<{ studyShortCode: string; name: string }>; fileRows: number[] }
  | { ok: false; errors: BulkImportValidationError[]; fileRows: number[] } {
  const defaultStudy = fixedStudyShortCode?.trim() || undefined
  let parsed: ReturnType<typeof parseBulkImportTemplateCsv>
  try {
    parsed = parseBulkImportTemplateCsv(text)
  } catch (error) {
    return {
      ok: false,
      errors: [{ fileRows: [], error: error instanceof Error ? error.message : 'Failed to parse CSV' }],
      fileRows: [],
    }
  }
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      errors: [{ fileRows: [], error: 'CSV file is empty or has no data rows' }],
      fileRows: [],
    }
  }

  const fileRows = parsed.rows.map((r) => r.fileRow)
  const errors: BulkImportValidationError[] = []
  const subjects: Array<{ studyShortCode: string; name: string }> = []

  for (const { row, fileRow } of parsed.rows) {
    const studyShortCode = trimCell(row.study_short_code) || defaultStudy
    const name = trimCell(row.subject_name)
    if (!studyShortCode) {
      errors.push({ fileRows: [fileRow], error: 'Missing required value: study_short_code' })
    }
    if (!name) {
      errors.push({ fileRows: [fileRow], error: 'Missing required value: subject_name' })
    }
    if (studyShortCode && name) {
      subjects.push({ studyShortCode, name })
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, fileRows }
  }
  return { ok: true, subjects, fileRows }
}
