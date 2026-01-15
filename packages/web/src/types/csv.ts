/**
 * CSV import type definitions
 */

import type { ContainerType } from '../components/ContainerRegistration'

/**
 * Base CSV row structure (all fields are strings from CSV parsing)
 */
export interface BaseCSVRow {
  [key: string]: string
}

/**
 * Subject CSV row (minimal fields for subject-only import)
 */
export interface SubjectCSVRow extends BaseCSVRow {
  study_short_code: string
  subject_name: string
}

/**
 * Specimen CSV row (includes specimen fields)
 */
export interface SpecimenCSVRow {
  study_short_code: string
  subject_name: string
  specimen_type_name: string
  collection_date?: string
  collection_name?: string
  collection_barcode?: string
  container_type?: string
  barcode?: string
  position?: string
  label?: string
  [key: string]: string | undefined
}

/**
 * Validated subject data (ready for API)
 */
export interface ValidatedSubjectData {
  studyShortCode: string
  name: string
}

/**
 * Validated specimen data (ready for API)
 */
export interface ValidatedSpecimenData {
  sourceType: 'subject'
  studyShortCode: string
  subjectName: string
  specimenTypeName: string
  collectionDate?: string
  container?: {
    containerType: ContainerType
    collectionName: string
    collectionBarcode?: string
    barcode?: string
    position?: string
    label?: string
  }
}

/**
 * Validation error
 */
export interface ValidationError {
  row: number
  error: string
  field?: string
}

/**
 * CSV validation result
 */
export interface CSVValidationResult {
  valid: boolean
  errors: ValidationError[]
  data: ValidatedSubjectData[] | ValidatedSpecimenData[]
  preview?: Array<Record<string, string>>
}

/**
 * Missing collection information
 */
export interface MissingCollection {
  name: string
  barcode?: string
  locationId: number | null
  collectionBarcode?: string
  status: 'pending' | 'creating' | 'success' | 'error'
  error?: string
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean
  created: number
  errors?: Array<{ index: number; error: string }>
}
