/**
 * Shared export row and filter types for container export (API + web client).
 * Types-only — runtime validation remains server-side in export routes.
 */

export interface ExportFilters {
  study: string
  specimen_type_ids?: number[]
  container_types?: string[]
  date_from?: string
  date_to?: string
  created_from?: string
  created_to?: string
  /** Containers must have every selected tag (AND semantics). */
  tag_ids?: number[]
  subject_ids?: number[]
  /** Global tolerance for exact subject collection dates (defaults to 0). */
  date_tolerance?: number
  subject_dates?: {
    [subjectId: number]:
      | { exact: string }
      | { from?: string; to?: string }
  }
}

export interface ContainerExportData {
  container_id: number
  container_type: string
  barcode?: string
  position?: string
  label?: string
  collection_name?: string
  /** Comma-separated tag names, sorted alphabetically. */
  tags: string
  status: string
  comment?: string
  specimen_id: number
  specimen_type: string
  collection_date?: string
  subject_id?: number
  subject_name?: string
  control_batch_id?: number
  control_batch_name?: string
  control_definition_name?: string
  control_type?: string
  target_density?: number
  target_density_unit?: string
  strain_composition?: string
  /** Omitted for control-batch specimens (provenance via control columns). */
  study_id?: number
  study_title?: string
  study_code?: string
  study_lead_person?: string
  location_path?: string
  location_id?: number
  location_name?: string
  created: string
  last_updated: string
}
