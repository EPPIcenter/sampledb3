import type { CsvCellValue } from './csv'

export type ExportColumnKind = 'identifier' | 'numeric' | 'date' | 'timestamp' | 'text'

export interface ExportColumnDefinition {
  key: string
  label: string
  kind: ExportColumnKind
}

/** Container export and collection table column catalog. */
export const EXPORT_ENTRY_COLUMNS: ExportColumnDefinition[] = [
  { key: 'container_id', label: 'Container ID', kind: 'identifier' },
  { key: 'container_type', label: 'Container Type', kind: 'text' },
  { key: 'barcode', label: 'Barcode', kind: 'identifier' },
  { key: 'position', label: 'Position', kind: 'identifier' },
  { key: 'label', label: 'Container Name', kind: 'identifier' },
  { key: 'collection_name', label: 'Collection Name', kind: 'identifier' },
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'tags', label: 'Tags', kind: 'text' },
  { key: 'comment', label: 'Comment', kind: 'text' },
  { key: 'specimen_id', label: 'Specimen ID', kind: 'identifier' },
  { key: 'specimen_type', label: 'Specimen Type', kind: 'text' },
  { key: 'collection_date', label: 'Collection Date', kind: 'date' },
  { key: 'subject_id', label: 'Subject ID', kind: 'identifier' },
  { key: 'subject_name', label: 'Subject Name', kind: 'identifier' },
  { key: 'control_batch_id', label: 'Control Batch ID', kind: 'identifier' },
  { key: 'control_batch_name', label: 'Control Batch Name', kind: 'identifier' },
  { key: 'control_definition_name', label: 'Control Definition Name', kind: 'identifier' },
  { key: 'control_type', label: 'Control Type', kind: 'text' },
  { key: 'target_density', label: 'Target Density', kind: 'numeric' },
  { key: 'target_density_unit', label: 'Target Density Unit', kind: 'text' },
  { key: 'strain_composition', label: 'Strain Composition', kind: 'text' },
  { key: 'study_id', label: 'Study ID', kind: 'identifier' },
  { key: 'study_code', label: 'Study Code', kind: 'identifier' },
  { key: 'study_title', label: 'Study Title', kind: 'text' },
  { key: 'study_lead_person', label: 'Study Lead Person', kind: 'text' },
  { key: 'location_path', label: 'Location Path', kind: 'identifier' },
  { key: 'created', label: 'Created', kind: 'timestamp' },
  { key: 'last_updated', label: 'Last Updated', kind: 'timestamp' },
]

/** Specimen, inventory, and other lightweight server CSV exports. */
export const SIMPLE_EXPORT_COLUMNS: ExportColumnDefinition[] = [
  { key: 'id', label: 'ID', kind: 'identifier' },
  { key: 'source_type', label: 'Source Type', kind: 'text' },
  { key: 'count', label: 'Count', kind: 'numeric' },
]

const COLUMN_KIND_BY_KEY = new Map<string, ExportColumnKind>(
  [...EXPORT_ENTRY_COLUMNS, ...SIMPLE_EXPORT_COLUMNS].map((col) => [col.key, col.kind])
)

// Keys exported outside the UI catalogs
COLUMN_KIND_BY_KEY.set('remaining_quantity', 'numeric')
COLUMN_KIND_BY_KEY.set('location_id', 'identifier')
COLUMN_KIND_BY_KEY.set('location_name', 'text')

export const DEFAULT_EXPORT_COLUMN_KEYS = EXPORT_ENTRY_COLUMNS.map((col) => col.key)

export const DEFAULT_TABLE_VIEW_COLUMN_KEYS = [
  'position',
  'barcode',
  'subject_name',
  'study_code',
  'specimen_type',
  'collection_date',
  'comment',
  'status',
  'created',
  'last_updated',
]

export function getExportColumnLabel(key: string): string {
  return EXPORT_ENTRY_COLUMNS.find((col) => col.key === key)?.label ?? key
}

export function getExportColumnKind(key: string): ExportColumnKind {
  return COLUMN_KIND_BY_KEY.get(key) ?? 'text'
}

function formatDateOnly(value: unknown): string {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value
    }
    const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})(T|\s|$)/)
    if (isoDateMatch) {
      return isoDateMatch[1]
    }
    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  } else if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }
  return String(value)
}

function formatTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      return date.toISOString()
    }
  } else if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

/** Format one export cell for CSV/XLSX based on column catalog metadata. */
export function formatExportCellValue(columnKey: string, value: unknown): CsvCellValue {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  switch (getExportColumnKind(columnKey)) {
    case 'date':
      return formatDateOnly(value)
    case 'timestamp':
      return formatTimestamp(value)
    case 'numeric':
      if (typeof value === 'number') return value
      {
        const parsed = Number(value)
        if (!Number.isNaN(parsed) && String(value).trim() !== '') return parsed
      }
      return String(value)
    case 'identifier':
    case 'text':
    default:
      return String(value)
  }
}
