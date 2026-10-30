import { parseCsv } from './csv'
import type { SubjectDateFilter, SubjectDateSelection } from './export'

export interface ExportFilterColumnSpec {
  key: string
  canonicalHeader: string
  aliases: string[]
}

export interface MultiStudyExportFilterRow {
  study_short_code: string
  subject_name: string
  collection_date?: string
  date_from?: string
  date_to?: string
}

export interface SingleStudyExportFilterRow {
  subject_name: string
  collection_date?: string
  date_from?: string
  date_to?: string
}

const MULTI_STUDY_REQUIRED: ExportFilterColumnSpec[] = [
  {
    key: 'study_short_code',
    canonicalHeader: 'study_short_code',
    aliases: ['study short code'],
  },
  {
    key: 'subject_name',
    canonicalHeader: 'subject_name',
    aliases: ['subject name'],
  },
]

const SINGLE_STUDY_REQUIRED: ExportFilterColumnSpec[] = [
  {
    key: 'subject_name',
    canonicalHeader: 'subject_name',
    aliases: ['subject name'],
  },
]

const SUBJECT_DATE_OPTIONAL: ExportFilterColumnSpec[] = [
  {
    key: 'collection_date',
    canonicalHeader: 'collection_date',
    aliases: ['collection date'],
  },
  {
    key: 'date_from',
    canonicalHeader: 'date_from',
    aliases: ['date from'],
  },
  {
    key: 'date_to',
    canonicalHeader: 'date_to',
    aliases: ['date to'],
  },
]

const BARCODE_REQUIRED: ExportFilterColumnSpec[] = [
  {
    key: 'barcode',
    canonicalHeader: 'barcode',
    aliases: ['container barcode', 'container_barcode'],
  },
]

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/^"|"$/g, '')
}

function findColumnIndex(headers: string[], spec: ExportFilterColumnSpec): number {
  const normalizedHeaders = headers.map(normalizeHeader)
  const aliases = new Set(
    [spec.canonicalHeader, ...spec.aliases].map((alias) => alias.toLowerCase())
  )
  return normalizedHeaders.findIndex((header) => aliases.has(header))
}

function resolveColumnIndices(
  headerRow: string[],
  required: ExportFilterColumnSpec[],
  optional: ExportFilterColumnSpec[] = []
): Map<string, number> {
  const indices = new Map<string, number>()

  for (const spec of [...required, ...optional]) {
    const index = findColumnIndex(headerRow, spec)
    if (index >= 0) {
      indices.set(spec.key, index)
    }
  }

  for (const spec of required) {
    if (!indices.has(spec.key)) {
      throw new Error(`CSV must contain a "${spec.canonicalHeader}" column`)
    }
  }

  return indices
}

function cellValue(row: string[], index: number | undefined): string {
  if (index === undefined || index < 0) return ''
  return row[index]?.trim() ?? ''
}

function parseSubjectDateFields(
  row: string[],
  indices: Map<string, number>
): Pick<MultiStudyExportFilterRow, 'collection_date' | 'date_from' | 'date_to'> {
  const result: Pick<MultiStudyExportFilterRow, 'collection_date' | 'date_from' | 'date_to'> = {}

  for (const key of ['collection_date', 'date_from', 'date_to'] as const) {
    const index = indices.get(key)
    if (index === undefined) continue
    const value = cellValue(row, index)
    if (value) result[key] = value
  }

  return result
}

function assertNonEmptyCsv(csvText: string): string[][] {
  if (!csvText.trim()) {
    throw new Error('File is empty')
  }

  const rows = parseCsv(csvText)
  if (rows.length === 0) {
    throw new Error('CSV file is empty')
  }

  return rows
}

export function parseMultiStudyExportFilterCsv(csvText: string): MultiStudyExportFilterRow[] {
  const rows = assertNonEmptyCsv(csvText)
  const indices = resolveColumnIndices(rows[0], MULTI_STUDY_REQUIRED, SUBJECT_DATE_OPTIONAL)
  const data: MultiStudyExportFilterRow[] = []

  for (const row of rows.slice(1)) {
    const studyShortCode = cellValue(row, indices.get('study_short_code'))
    const subjectName = cellValue(row, indices.get('subject_name'))
    if (!studyShortCode || !subjectName) continue

    data.push({
      study_short_code: studyShortCode,
      subject_name: subjectName,
      ...parseSubjectDateFields(row, indices),
    })
  }

  if (data.length === 0) {
    throw new Error('No valid data rows found in CSV')
  }

  return data
}

export function parseSingleStudyExportFilterCsv(csvText: string): SingleStudyExportFilterRow[] {
  const rows = assertNonEmptyCsv(csvText)
  const indices = resolveColumnIndices(rows[0], SINGLE_STUDY_REQUIRED, SUBJECT_DATE_OPTIONAL)
  const data: SingleStudyExportFilterRow[] = []

  for (const row of rows.slice(1)) {
    const subjectName = cellValue(row, indices.get('subject_name'))
    if (!subjectName) continue

    data.push({
      subject_name: subjectName,
      ...parseSubjectDateFields(row, indices),
    })
  }

  if (data.length === 0) {
    throw new Error('No valid data rows found in CSV')
  }

  return data
}

export function parseBarcodeExportFilterCsv(csvText: string): string[] {
  const rows = assertNonEmptyCsv(csvText)
  const indices = resolveColumnIndices(rows[0], BARCODE_REQUIRED)
  const barcodes: string[] = []

  for (const row of rows.slice(1)) {
    const barcode = cellValue(row, indices.get('barcode'))
    if (barcode) barcodes.push(barcode)
  }

  if (barcodes.length === 0) {
    throw new Error('No valid barcodes found in CSV')
  }

  return barcodes
}

/**
 * Add one listing of a Subject's collection dates to the Subject's selection so far. A
 * listing is one date filter, several (one per visit), or none: null, undefined or an empty
 * list. Dated listings add up as alternatives. A listing with no dates selects all of the
 * Subject's dates and wins over its dated listings, in either order.
 */
export function addSubjectDates(
  selection: SubjectDateSelection | undefined,
  dates: SubjectDateFilter | readonly SubjectDateFilter[] | null | undefined,
): SubjectDateSelection {
  if (selection?.kind === 'all') return selection
  const listed = dates == null ? [] : Array.isArray(dates) ? dates : [dates as SubjectDateFilter]
  if (listed.length === 0) return { kind: 'all' }
  return { kind: 'dates', filters: [...(selection?.filters ?? []), ...listed] }
}

/**
 * Fold subject-list filter rows into one collection-date selection per subject name, by
 * `addSubjectDates`. A row with no date selects all of that subject's dates.
 */
export function subjectDateSelections(rows: SingleStudyExportFilterRow[]): Map<string, SubjectDateSelection> {
  const selections = new Map<string, SubjectDateSelection>()
  for (const row of rows) {
    const dateFilter: SubjectDateFilter | null = row.collection_date
      ? { exact: row.collection_date }
      : row.date_from || row.date_to
        ? { from: row.date_from, to: row.date_to }
        : null
    selections.set(row.subject_name, addSubjectDates(selections.get(row.subject_name), dateFilter))
  }
  return selections
}
