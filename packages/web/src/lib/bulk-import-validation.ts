/**
 * CSV parsing and display helpers for the bulk import flow.
 * Server validate endpoints are the source of truth for row rules.
 */
import type { ContainerType } from './container-types'
import { getCollectionNameColumn } from './container-columns'
import type { FlatBulkImportContainer } from './bulk-import-payload'

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
    paper: ['box_name', 'bag_name', 'sheet_name'],
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
    paper: ['sublabel', 'comment'],
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

/** Resolve paper parent from bulk import CSV row (exactly one of box_name or bag_name). */
export function resolveBulkImportPaperParent(
  row: CSVRow
):
  | { parentCollectionType: 'box' | 'bag'; collectionName: string }
  | { error: string }
  | undefined {
  const boxName = trimCell(row.box_name)
  const bagName = trimCell(row.bag_name)
  if (boxName && bagName) {
    return { error: 'Provide either box_name or bag_name, not both' }
  }
  if (boxName) {
    return { parentCollectionType: 'box', collectionName: boxName }
  }
  if (bagName) {
    return { parentCollectionType: 'bag', collectionName: bagName }
  }
  return undefined
}

/** Get collection name/identifier from a CSV row (type-specific column only: plate_name, box_name, or bag_name). */
export function getBulkImportRowCollectionName(
  row: CSVRow,
  containerType: ContainerType | 'none' | ''
): string | undefined {
  if (containerType === 'paper') {
    const parent = resolveBulkImportPaperParent(row)
    if (!parent || 'error' in parent) return undefined
    return parent.collectionName
  }
  const column = getCollectionNameColumn(containerType)
  if (!column) return undefined
  const t = trimCell(row[column])
  return t || undefined
}

/** Per-row collection check for missing-collection resolution (supports mixed box/bag paper rows). */
export function getBulkImportRowCollectionCheck(
  row: CSVRow,
  containerType: ContainerType | 'none' | ''
): { identifier: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' } | undefined {
  if (containerType === 'paper') {
    const parent = resolveBulkImportPaperParent(row)
    if (!parent || 'error' in parent) return undefined
    return {
      identifier: parent.collectionName,
      type: parent.parentCollectionType,
    }
  }
  const collectionType = getBulkImportCollectionType(containerType)
  const name = getBulkImportRowCollectionName(row, containerType)
  if (!collectionType || !name) return undefined
  return { identifier: name, type: collectionType }
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
        let container: FlatBulkImportContainer = {
          containerType,
          collectionBarcode: trimCell(row.collection_barcode) || undefined,
          barcode: trimCell(row.barcode) || undefined,
          position: trimCell(row.position) || undefined,
          sheetName: trimCell(row.sheet_name) || undefined,
          sublabel: trimCell(row.sublabel) || undefined,
          comment: trimCell(row.comment) || undefined,
        }
        if (containerType === 'paper') {
          const parent = resolveBulkImportPaperParent(row)
          if (parent && !('error' in parent)) {
            container = {
              ...container,
              parentCollectionType: parent.parentCollectionType,
              collectionName: parent.collectionName,
            }
          }
        } else {
          container = {
            ...container,
            collectionName: getRowCollectionName(row, containerType),
          }
        }
        spec.container = container
      }
      data.push(spec)
    }
  }

  return data
}
