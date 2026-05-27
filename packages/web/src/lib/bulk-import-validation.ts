/**
 * CSV parsing and display helpers for the bulk import flow.
 * Server validate endpoints are the source of truth for row rules.
 */
import type { ContainerType } from './container-types'
import { getCollectionNameColumn } from './container-columns'

export interface CSVRow {
  [key: string]: string
}

export interface BulkImportValidationError {
  row: number
  error: string
}

export type ImportType = 'subjects' | 'specimens' | 'combined'

export function getBulkImportCollectionType(
  containerType: ContainerType | 'none' | ''
): 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | null {
  switch (containerType) {
    case 'micronix_tube':
    case 'static_well':
      return 'micronix_plate'
    case 'cryovial_tube':
      return 'cryovial_box'
    case 'paper':
      return 'box'
    default:
      return null
  }
}

export function getBulkImportRequiredFields(opts: {
  importType: ImportType
  containerType: ContainerType | 'none' | ''
  fixedStudyShortCode?: string
}): string[] {
  const { importType, containerType, fixedStudyShortCode } = opts
  const base = fixedStudyShortCode
    ? ['subject_name', 'specimen_type_name']
    : ['study_short_code', 'subject_name', 'specimen_type_name']
  if (!containerType || containerType === 'none' || importType === 'subjects') {
    if (importType === 'subjects') {
      return fixedStudyShortCode ? ['subject_name'] : ['study_short_code', 'subject_name']
    }
    return base
  }
  const containerFields: Record<ContainerType, string[]> = {
    micronix_tube: ['plate_name', 'barcode', 'position'],
    cryovial_tube: ['box_name', 'position'],
    paper: ['bag_name', 'label'],
    static_well: ['plate_name', 'position'],
  }
  return [...base, ...containerFields[containerType]]
}

export function getBulkImportOptionalFields(
  containerType: ContainerType | 'none' | ''
): string[] {
  if (!containerType || containerType === 'none') return []
  const optionalFields: Record<ContainerType, string[]> = {
    micronix_tube: ['comment'],
    cryovial_tube: ['barcode', 'comment'],
    paper: ['comment'],
    static_well: ['comment'],
  }
  return optionalFields[containerType]
}

function trimCell(s: string | undefined): string {
  return (s ?? '').trim()
}

function normalizeHeader(header: string): string {
  const lower = header.trim().toLowerCase()
  if (lower === 'well_position' || lower === 'well') return 'position'
  return lower
}

export function parseBulkImportCSV(text: string): CSVRow[] {
  const lines = text.split('\n').filter((line) => line.trim())
  if (lines.length < 2) return []

  const rawHeaders = lines[0].split(',').map((h) => h.trim())
  const headers = rawHeaders.map(normalizeHeader)
  const rows: CSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row: CSVRow = {}
    headers.forEach((header, j) => {
      row[header] = values[j]?.trim() ?? ''
    })
    rows.push(row)
  }
  return rows
}

/** Get collection name/identifier from a CSV row (type-specific column only: plate_name, box_name, or bag_name). */
export function getBulkImportRowCollectionName(
  row: CSVRow,
  containerType: ContainerType | 'none' | ''
): string | undefined {
  const column = getCollectionNameColumn(containerType)
  if (!column) return undefined
  const t = trimCell(row[column])
  return t || undefined
}

function getRowCollectionName(
  row: CSVRow,
  containerType: ContainerType | 'none' | ''
): string | undefined {
  return getBulkImportRowCollectionName(row, containerType)
}

/** Map parsed CSV rows to API payloads (no business-rule validation). */
export function mapBulkImportRowsToPayload(
  rows: CSVRow[],
  opts: {
    importType: ImportType
    containerType: ContainerType | 'none' | ''
    fixedStudyShortCode?: string
  }
): Record<string, unknown>[] {
  const { importType, containerType, fixedStudyShortCode } = opts
  const data: Record<string, unknown>[] = []

  for (const row of rows) {
    if (importType === 'subjects') {
      data.push({
        studyShortCode: fixedStudyShortCode || row.study_short_code,
        name: row.subject_name,
      })
    } else {
      const spec: Record<string, unknown> = {
        sourceType: 'subject' as const,
        studyShortCode: fixedStudyShortCode ?? row.study_short_code,
        subjectName: row.subject_name,
        specimenTypeName: row.specimen_type_name,
        collectionDate: row.collection_date || undefined,
      }
      if (containerType !== 'none' && containerType !== '') {
        spec.container = {
          containerType,
          collectionName: getRowCollectionName(row, containerType),
          collectionBarcode: trimCell(row.collection_barcode) || undefined,
          barcode: trimCell(row.barcode) || undefined,
          position: trimCell(row.position) || undefined,
          label: trimCell(row.label) || undefined,
          comment: trimCell(row.comment) || undefined,
        }
      }
      data.push(spec)
    }
  }

  return data
}
