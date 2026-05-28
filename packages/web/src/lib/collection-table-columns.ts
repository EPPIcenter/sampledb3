/**
 * Collection table view: column definitions and row builder.
 * Aligns with export-style columns but excludes all internal database IDs
 * (container_id, specimen_id, subject_id, study_id, control_batch_id).
 * Only user-facing and specimen/source details are included.
 */
import { getExportColumnLabel } from './export-columns'

export interface CollectionTableColumn {
  key: string
  label: string
}

/** Container source as returned by collection APIs (subject or control). */
interface ContainerSource {
  type?: string
  name?: string
  study?: { code?: string; title?: string; leadPerson?: string }
  definitionName?: string | null
  controlType?: string
  targetDensity?: number | null
  targetDensityUnit?: string | null
  strainComposition?: string | null
}

/** Minimal container shape from collection detail API responses. */
export interface CollectionEntryContainer {
  remainingQuantity?: number
  comment?: string | null
  tags?: Array<{ id: number; name: string }>
  source?: ContainerSource | null
  specimen?: { collectionDate?: string | null } | null
  specimenTypeName?: string | null
  created?: string | null
  lastUpdated?: string | null
}

/** Optional context from the parent collection (plate/box/bag/sheet) for row building. */
export interface CollectionTableContext {
  collectionName?: string
  locationPath?: string
}

/** Single well/position/paper entry from a collection. */
export interface CollectionTableEntry {
  position?: string | null
  barcode?: string | null
  /** Container type string matching export (e.g. micronix_tube, static_well, cryovial_tube, paper). */
  containerType?: string | null
  container?: CollectionEntryContainer | null
  /** Parent collection context for collection_name and location_path. */
  context?: CollectionTableContext | null
}

/** Columns for grid-based collection tables (plate, cryovial box). No internal IDs. */
export const COLLECTION_GRID_TABLE_COLUMNS: CollectionTableColumn[] = [
  { key: 'position', label: 'Position' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'status', label: 'Status' },
  { key: 'subject_name', label: 'Subject Name' },
  { key: 'study_code', label: 'Study Code' },
  { key: 'control_definition_name', label: 'Control Definition Name' },
  { key: 'control_type', label: 'Control Type' },
  { key: 'collection_date', label: 'Collection Date' },
  { key: 'tags', label: 'Tags' },
]

/** Columns for sheet/paper tables (box, bag, sheet). Same as grid plus Sheet. No internal IDs. */
export const COLLECTION_SHEET_TABLE_COLUMNS: CollectionTableColumn[] = [
  { key: 'sheet', label: 'Sheet' },
  { key: 'position', label: 'Position' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'status', label: 'Status' },
  { key: 'subject_name', label: 'Subject Name' },
  { key: 'study_code', label: 'Study Code' },
  { key: 'control_definition_name', label: 'Control Definition Name' },
  { key: 'control_type', label: 'Control Type' },
  { key: 'collection_date', label: 'Collection Date' },
  { key: 'tags', label: 'Tags' },
]

export type CollectionTableRow = Record<string, string | number | null>

/**
 * All export-style column keys that the collection table row builder can produce (no internal IDs).
 * Used so table view can show any configured export column where data is available.
 */
export const COLLECTION_GRID_TABLE_ROW_KEYS = new Set([
  'position',
  'barcode',
  'container_type',
  'label',
  'collection_name',
  'status',
  'tags',
  'comment',
  'specimen_type',
  'collection_date',
  'subject_name',
  'control_batch_name',
  'control_definition_name',
  'control_type',
  'target_density',
  'target_density_unit',
  'strain_composition',
  'study_code',
  'study_title',
  'study_lead_person',
  'location_path',
  'created',
  'last_updated',
])

/** Sheet tables add 'sheet'; use this for box/bag/sheet detail pages. */
export const COLLECTION_SHEET_TABLE_ROW_KEYS = new Set([
  'sheet',
  ...COLLECTION_GRID_TABLE_ROW_KEYS,
])

/**
 * Build one table row from a collection entry (well, position, or paper).
 * Outputs all export-style column keys (except internal IDs) so table view can show any configured column.
 * Uses empty string for fields not provided by the collection detail API.
 */
export function buildCollectionTableRow(entry: CollectionTableEntry): CollectionTableRow {
  const container = entry.container
  const source = container?.source
  const context = entry.context
  const status =
    container != null
      ? container.remainingQuantity != null && container.remainingQuantity > 0
        ? 'In Use'
        : 'Exhausted'
      : ''

  const subjectName =
    source?.type === 'subject' || source?.type === 'control' ? (source.name ?? '') : ''
  const studyCode = source?.type === 'subject' ? (source.study?.code ?? '') : ''
  const studyTitle = source?.type === 'subject' ? (source.study?.title ?? '') : ''
  const studyLeadPerson = source?.type === 'subject' ? (source.study?.leadPerson ?? '') : ''
  const controlBatchName = source?.type === 'control' ? (source.name ?? '') : ''
  const controlDefinitionName =
    source?.type === 'control' ? (source.definitionName ?? '') : ''
  const controlType = source?.type === 'control' ? (source.controlType ?? '') : ''
  const targetDensity =
    source?.type === 'control' && source.targetDensity != null ? source.targetDensity : ''
  const targetDensityUnit = source?.type === 'control' ? (source.targetDensityUnit ?? '') : ''
  const strainComposition = source?.type === 'control' ? (source.strainComposition ?? '') : ''
   
  const collectionDate = container?.specimen?.collectionDate ?? ''
  const tags =
    container?.tags && container.tags.length > 0
      ? [...container.tags].map((t) => t.name).sort((a, b) => a.localeCompare(b)).join(', ')
      : ''
  const comment = container?.comment ?? ''
   
  const specimenTypeName = container?.specimenTypeName ?? ''
  const created = container?.created ?? ''
  const lastUpdated = container?.lastUpdated ?? ''

  return {
    position: entry.position ?? '',
    barcode: entry.barcode ?? '',
    container_type: entry.containerType ?? '',
    label: '',
    collection_name: context?.collectionName ?? '',
    status,
    tags,
    comment,
    specimen_type: specimenTypeName,
    collection_date: collectionDate,
    subject_name: subjectName,
    control_batch_name: controlBatchName,
    control_definition_name: controlDefinitionName,
    control_type: controlType,
    target_density: targetDensity,
    target_density_unit: targetDensityUnit,
    strain_composition: strainComposition,
    study_code: studyCode,
    study_title: studyTitle,
    study_lead_person: studyLeadPerson,
    location_path: context?.locationPath ?? '',
    created,
    last_updated: lastUpdated,
  }
}

/**
 * Build one table row for a sheet/paper (box or bag), including sheet name.
 */
export function buildSheetPaperTableRow(
  entry: CollectionTableEntry,
  sheetName: string
): CollectionTableRow {
  const row = buildCollectionTableRow(entry)
  return { sheet: sheetName, ...row }
}

/**
 * Resolve an export configuration's column keys to table columns (key + label)
 * for the collection table view. Only includes keys that exist in availableRowKeys;
 * uses shared export column definitions for labels. Preserves config order.
 * Returns empty array when no config keys match; caller should use fallback columns.
 */
export function getTableColumnsFromExportConfig(
  configColumnKeys: string[],
  availableRowKeys: Set<string>
): CollectionTableColumn[] {
  const result: CollectionTableColumn[] = []
  for (const key of configColumnKeys) {
    if (availableRowKeys.has(key)) {
      result.push({ key, label: getExportColumnLabel(key) })
    }
  }
  return result
}
