import type { InferSelectModel } from 'drizzle-orm'
import { study } from '../../db/schema'

export type StudyRecord = InferSelectModel<typeof study>

export interface ExportFilters {
  study: string
  specimen_type_ids?: number[]
  container_types?: string[]
  date_from?: string
  date_to?: string
  created_from?: string
  created_to?: string
  subject_ids?: number[]
  date_tolerance?: number  // Global tolerance for all exact dates (defaults to 0)
  subject_dates?: {  // Per-subject date filtering
    [subjectId: number]: 
      | { exact: string }  // Exact date match (tolerance applied from date_tolerance)
      | { from?: string, to?: string }  // Date range
  }
}

export interface ContainerExportData {
  container_id: number
  container_type: string
  barcode?: string
  position?: string
  label?: string
  collection_name?: string
  state: string
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
  study_id: number
  study_title: string
  study_code: string
  study_lead_person?: string
  location_path?: string
  location_id?: number
  location_name?: string
  created: string
  last_updated: string
}

export interface CSVExportOptions {
  delimiter?: string  // Default: ','
  includeBOM?: boolean  // Default: true
  lineEnding?: 'LF' | 'CRLF'  // Default: 'CRLF'
}

export interface ExportSummary {
  total_containers: number
  subjects_with_results: Array<{ name: string; count: number }>
  subjects_no_results: string[]  // Subject names with no matching containers
  subjects_not_found: string[]  // Subject names not found in study
  errors?: string[]  // Any other errors
}

// Multi-study container query builder
export interface MultiStudyExportEntry {
  study_short_code: string
  subject_name: string
  collection_date?: string
  date_from?: string
  date_to?: string
}

export interface MultiStudyExportResult {
  containers: ContainerExportData[]
  studies: Map<number, StudyRecord>
  summary: MultiStudyExportSummary
}

export interface MultiStudyExportSummary {
  total_containers: number
  studies: Array<{
    study_code: string
    study_title: string
    study_lead_person: string
    containers: number
    subjects_with_results: Array<{ name: string; count: number }>
    subjects_no_results: string[]
    subjects_not_found: string[]
  }>
  invalid_study_codes: string[]
  errors?: string[]
}
