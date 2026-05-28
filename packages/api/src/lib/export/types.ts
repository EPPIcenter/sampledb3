import type { InferSelectModel } from 'drizzle-orm'
import { study } from '../../db/schema'

export type { ContainerExportData, ExportFilters } from '@sampledb/contract'

export type StudyRecord = InferSelectModel<typeof study>

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
  containers: import('@sampledb/contract').ContainerExportData[]
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
