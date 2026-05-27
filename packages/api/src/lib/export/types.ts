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

export async function buildExportSummary(
  enrichedData: ContainerExportData[],
  requestedSubjectNames: string[],
  subjectNameToId: Map<string, number>,
  subjectIdToName: Map<number, string>
): Promise<ExportSummary> {
  const summary: ExportSummary = {
    total_containers: enrichedData.length,
    subjects_with_results: [],
    subjects_no_results: [],
    subjects_not_found: [],
  }

  // Count containers per subject
  const subjectCounts = new Map<number, number>()
  for (const container of enrichedData) {
    if (container.subject_id) {
      const count = subjectCounts.get(container.subject_id) || 0
      subjectCounts.set(container.subject_id, count + 1)
    }
  }

  // Build subjects_with_results
  for (const [subjectId, count] of subjectCounts.entries()) {
    const subjectName = subjectIdToName.get(subjectId)
    if (subjectName) {
      summary.subjects_with_results.push({ name: subjectName, count })
    }
  }

  // Identify subjects not found
  for (const subjectName of requestedSubjectNames) {
    if (!subjectNameToId.has(subjectName)) {
      summary.subjects_not_found.push(subjectName)
    }
  }

  // Identify subjects with no results (found but no containers)
  for (const subjectName of requestedSubjectNames) {
    const subjectId = subjectNameToId.get(subjectName)
    if (subjectId && !subjectCounts.has(subjectId)) {
      summary.subjects_no_results.push(subjectName)
    }
  }

  return summary
}

// Validate study codes
export async function validateStudyCodes(database: Database, studyCodes: string[]): Promise<{
  valid: Map<string, number>  // studyCode -> studyId
  invalid: string[]  // Invalid study codes
  studies: Map<number, StudyType>  // studyId -> study record
}> {
  const uniqueCodes = [...new Set(studyCodes)]
  const valid = new Map<string, number>()
  const invalid: string[] = []
  const studies = new Map<number, StudyType>()
  
  for (const code of uniqueCodes) {
    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.shortCode, code))
      .get()
    
    if (studyRecord) {
      valid.set(code, studyRecord.id)
      studies.set(studyRecord.id, studyRecord)
    } else {
      invalid.push(code)
    }
  }
  
  return { valid, invalid, studies }
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
  studies: Map<number, StudyType>
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
