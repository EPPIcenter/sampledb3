/**
 * Collection table view: column definitions and row builder.
 * Aligns with export-style columns but excludes all internal database IDs
 * (container_id, specimen_id, subject_id, study_id, control_batch_id).
 * Only user-facing and specimen/source details are included.
 */

export interface CollectionTableColumn {
  key: string
  label: string
}

/** Container source as returned by collection APIs (subject or control). */
interface ContainerSource {
  type?: string
  name?: string
  study?: { code?: string }
  definitionName?: string | null
  controlType?: string
}

/** Minimal container shape from collection detail API responses. */
export interface CollectionEntryContainer {
  remainingQuantity?: number
  state?: { name?: string } | null
  source?: ContainerSource | null
  specimen?: { collectionDate?: string | null } | null
}

/** Single well/position/paper entry from a collection. */
export interface CollectionTableEntry {
  position?: string | null
  barcode?: string | null
  container?: CollectionEntryContainer | null
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
  { key: 'state', label: 'State' },
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
  { key: 'state', label: 'State' },
]

export type CollectionTableRow = Record<string, string | number | null>

/**
 * Build one table row from a collection entry (well, position, or paper).
 * Uses only non-ID fields; aligns with export-style column keys.
 */
export function buildCollectionTableRow(entry: CollectionTableEntry): CollectionTableRow {
  const container = entry?.container
  const source = container?.source
  const status =
    container != null
      ? container.remainingQuantity != null && container.remainingQuantity > 0
        ? 'In Use'
        : 'Exhausted'
      : ''

  const subjectName =
    source?.type === 'subject' || source?.type === 'control' ? (source.name ?? '') : ''
  const studyCode = source?.type === 'subject' ? (source.study?.code ?? '') : ''
  const controlDefinitionName =
    source?.type === 'control' ? (source.definitionName ?? '') : ''
  const controlType = source?.type === 'control' ? (source.controlType ?? '') : ''
  const collectionDate = container?.specimen?.collectionDate ?? ''
  const state = container?.state?.name ?? ''

  return {
    position: entry?.position ?? '',
    barcode: entry?.barcode ?? '',
    status,
    subject_name: subjectName,
    study_code: studyCode,
    control_definition_name: controlDefinitionName,
    control_type: controlType,
    collection_date: collectionDate,
    state,
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
