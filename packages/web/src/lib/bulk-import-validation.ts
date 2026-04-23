/**
 * CSV parsing and validation for the bulk import flow (subjects, specimens, combined).
 * Shared so BulkImportFlow can stay a thin orchestrator and logic is testable.
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

export interface BulkImportValidationResult {
  valid: boolean
  errors: BulkImportValidationError[]
  data: Record<string, unknown>[]
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

export function validateBulkImportCSV(
  rows: CSVRow[],
  opts: {
    importType: ImportType
    containerType: ContainerType | 'none' | ''
    fixedStudyShortCode?: string
  }
): BulkImportValidationResult {
  const errors: BulkImportValidationError[] = []
  const data: Record<string, unknown>[] = []
  const { importType, containerType, fixedStudyShortCode } = opts
  const requiredFields = getBulkImportRequiredFields(opts)

  if (rows.length === 0) {
    return { valid: false, errors: [{ row: 0, error: 'CSV file is empty' }], data: [] }
  }

  const headers = Object.keys(rows[0] as object)
  const missingColumns = requiredFields.filter((col) => !headers.includes(col))

  if (missingColumns.length > 0) {
    return {
      valid: false,
      errors: [{ row: 0, error: `Missing required columns: ${missingColumns.join(', ')}` }],
      data: [],
    }
  }

  if (containerType !== 'none' && containerType !== '' && headers.includes('container_type')) {
    const containerTypes = new Set(
      rows.map((row) => row.container_type).filter(Boolean)
    )
    if (containerTypes.size > 1) {
      errors.push({ row: 0, error: 'All rows must have the same container_type' })
    }
    if (
      containerTypes.size === 1 &&
      !containerTypes.has(containerType as string)
    ) {
      errors.push({
        row: 0,
        error: `Container type mismatch: CSV has ${Array.from(containerTypes)[0]}, but selected type is ${containerType}`,
      })
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowErrors: string[] = []

    for (const field of requiredFields) {
      if (!trimCell(row[field])) {
        rowErrors.push(`Missing required field: ${field}`)
      }
    }

    if (containerType !== 'none' && containerType !== '') {
      if (containerType === 'micronix_tube') {
        if (!trimCell(row.barcode)) rowErrors.push('Barcode is required for micronix tubes')
        if (!trimCell(row.position)) rowErrors.push('Position is required for micronix tubes')
      } else if (containerType === 'cryovial_tube') {
        if (!trimCell(row.position)) rowErrors.push('Position is required for cryovial tubes')
      } else if (containerType === 'static_well') {
        if (!trimCell(row.position)) rowErrors.push('Position is required for static wells')
      } else {
        if (!trimCell(row.label)) rowErrors.push('Label is required for papers')
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: i + 1, error: rowErrors.join('; ') })
    } else {
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
  }

  return { valid: errors.length === 0, errors, data }
}
