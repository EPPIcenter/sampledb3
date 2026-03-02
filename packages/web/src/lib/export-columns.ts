/**
 * Single source of truth for container-entry column keys and labels.
 * Used by export configurations (Export page, BarcodeExport, ExportModal) and
 * by collection table view (plate, box, bag, sheet) so both use the same settings.
 */

export interface ExportEntryColumn {
  key: string
  label: string
}

/** All available export/table columns with display names. */
export const EXPORT_ENTRY_COLUMNS: ExportEntryColumn[] = [
  { key: 'container_id', label: 'Container ID' },
  { key: 'container_type', label: 'Container Type' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'position', label: 'Position' },
  { key: 'label', label: 'Container Name' },
  { key: 'collection_name', label: 'Collection Name' },
  { key: 'status', label: 'Status' },
  { key: 'state', label: 'State' },
  { key: 'comment', label: 'Comment' },
  { key: 'specimen_id', label: 'Specimen ID' },
  { key: 'specimen_type', label: 'Specimen Type' },
  { key: 'collection_date', label: 'Collection Date' },
  { key: 'subject_id', label: 'Subject ID' },
  { key: 'subject_name', label: 'Subject Name' },
  { key: 'control_batch_id', label: 'Control Batch ID' },
  { key: 'control_batch_name', label: 'Control Batch Name' },
  { key: 'control_definition_name', label: 'Control Definition Name' },
  { key: 'control_type', label: 'Control Type' },
  { key: 'target_density', label: 'Target Density' },
  { key: 'target_density_unit', label: 'Target Density Unit' },
  { key: 'strain_composition', label: 'Strain Composition' },
  { key: 'study_id', label: 'Study ID' },
  { key: 'study_code', label: 'Study Code' },
  { key: 'study_title', label: 'Study Title' },
  { key: 'study_lead_person', label: 'Study Lead Person' },
  { key: 'location_path', label: 'Location Path' },
  { key: 'created', label: 'Created' },
  { key: 'last_updated', label: 'Last Updated' },
]

/** Default column order (all columns). */
export const DEFAULT_EXPORT_COLUMN_KEYS = EXPORT_ENTRY_COLUMNS.map((col) => col.key)

/** Default columns for table view configurations (browse-friendly subset). */
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

/** Get label for a column key. */
export function getExportColumnLabel(key: string): string {
  return EXPORT_ENTRY_COLUMNS.find((col) => col.key === key)?.label ?? key
}
