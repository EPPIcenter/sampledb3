import type { ContainerExportData, CSVExportOptions, ExportFilters } from '@sampledb/contract'
import { api } from './client'
import {
  downloadExportFile,
  downloadGetExportResponse,
  downloadPostExportEnvelope,
  type ExportDownloadFormat,
} from '../export-download'

export type { ContainerExportData, ExportFilters, CSVExportOptions }

function csvOptionsToQueryParams(csvOptions?: CSVExportOptions): Record<string, string | boolean> {
  const params: Record<string, string | boolean> = {}
  if (csvOptions?.delimiter) params.csv_delimiter = csvOptions.delimiter
  if (csvOptions?.bom !== undefined) params.csv_bom = csvOptions.bom
  if (csvOptions?.lineEnding) params.csv_line_ending = csvOptions.lineEnding === 'lf' ? 'LF' : 'CRLF'
  return params
}

export type PostExportEnvelopeResponse = {
  data: string | unknown
  format: ExportDownloadFormat
  filename?: string
}

export const exportApi = {
  specimens: (params?: { study?: string; source_type?: string; csv_delimiter?: ',' | ';' | '\t'; csv_bom?: boolean; csv_line_ending?: 'LF' | 'CRLF' }) => {
    const queryParams: any = { ...params }
    if (params?.csv_delimiter) queryParams.csv_delimiter = params.csv_delimiter
    if (params?.csv_bom !== undefined) queryParams.csv_bom = params.csv_bom
    if (params?.csv_line_ending) queryParams.csv_line_ending = params.csv_line_ending
    return api.get('/export/specimens.csv', { params: queryParams, responseType: 'blob' })
  },
  inventory: (csvOptions?: CSVExportOptions) => {
    return api.get('/export/inventory.csv', { params: csvOptionsToQueryParams(csvOptions), responseType: 'blob' })
  },
  containers: (params: ExportFilters, format: 'csv' | 'xlsx' | 'json' = 'csv', columns?: string[], csvOptions?: CSVExportOptions) => {
    const queryParams: Record<string, string | number | number[] | string[] | undefined> = { format }
    // Add study
    queryParams.study = params.study
    // Add date filters
    if (params.date_from) queryParams.date_from = params.date_from
    if (params.date_to) queryParams.date_to = params.date_to
    if (params.created_from) queryParams.created_from = params.created_from
    if (params.created_to) queryParams.created_to = params.created_to
    // Add columns if provided
    if (columns && columns.length > 0) queryParams.columns = JSON.stringify(columns)
    // Add arrays - axios will serialize these correctly
    if (params.specimen_type_ids && params.specimen_type_ids.length > 0) {
      queryParams.specimen_type_ids = params.specimen_type_ids
    }
    if (params.container_types && params.container_types.length > 0) {
      queryParams.container_types = params.container_types
    }
    if (params.tag_ids && params.tag_ids.length > 0) {
      queryParams.tag_ids = params.tag_ids
    }
    if (params.subject_ids && params.subject_ids.length > 0) {
      queryParams.subject_ids = params.subject_ids
    }
    // Add CSV options if provided
    if (csvOptions) {
      Object.assign(queryParams, csvOptionsToQueryParams(csvOptions))
    }
    return api.get('/export/containers', {
      params: queryParams,
      paramsSerializer: {
        indexes: null, // Use format: key=value1&key=value2 instead of key[]=value1&key[]=value2
      },
      responseType: format === 'json' ? 'json' : 'blob',
    })
  },
  containersCount: (params: ExportFilters) => {
    const queryParams: Record<string, string | number | number[] | string[] | undefined> = { count_only: 'true' }
    // Add study
    queryParams.study = params.study
    // Add date filters
    if (params.date_from) queryParams.date_from = params.date_from
    if (params.date_to) queryParams.date_to = params.date_to
    if (params.created_from) queryParams.created_from = params.created_from
    if (params.created_to) queryParams.created_to = params.created_to
    // Add arrays - axios will serialize these correctly
    if (params.specimen_type_ids && params.specimen_type_ids.length > 0) {
      queryParams.specimen_type_ids = params.specimen_type_ids
    }
    if (params.container_types && params.container_types.length > 0) {
      queryParams.container_types = params.container_types
    }
    if (params.tag_ids && params.tag_ids.length > 0) {
      queryParams.tag_ids = params.tag_ids
    }
    if (params.subject_ids && params.subject_ids.length > 0) {
      queryParams.subject_ids = params.subject_ids
    }
    return api.get<{ count: number }>('/export/containers', {
      params: queryParams,
      paramsSerializer: {
        indexes: null, // Use format: key=value1&key=value2 instead of key[]=value1&key[]=value2
      },
    })
  },
  availableTypes: (studyCode: string) =>
    api.get<{ specimen_types: Array<{ id: number; name: string }>; container_types: string[] }>(
      '/export/available-types',
      { params: { study: studyCode } }
    ),
  containersByNames: (params: {
    study: string
    subject_names: string[]
    subject_dates?: { [subjectName: string]: { exact?: string; from?: string; to?: string } }
    date_tolerance?: number
    format?: 'csv' | 'xlsx' | 'json'
    columns?: string[]
    specimen_type_ids?: number[]
    container_types?: string[]
    tag_ids?: number[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
    csv_delimiter?: ',' | ';' | '\t'
    csv_bom?: boolean
    csv_line_ending?: 'LF' | 'CRLF'
  }) => {
    return api.post<{
      summary: {
        total_containers: number
        subjects_with_results: Array<{ name: string; count: number }>
        subjects_no_results: string[]
        subjects_not_found: string[]
        errors?: string[]
      }
      data: ContainerExportData[] | string
      format: 'csv' | 'xlsx' | 'json'
      filename?: string
    }>('/export/containers', params)
  },
  containersCountByNames: (params: {
    study: string
    subject_names: string[]
    subject_dates?: { [subjectName: string]: { exact?: string; from?: string; to?: string } }
    date_tolerance?: number
    specimen_type_ids?: number[]
    container_types?: string[]
    tag_ids?: number[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
  }) => {
    return api.post<{
      count: number
      summary: {
        total_containers: number
        subjects_with_results: Array<{ name: string; count: number }>
        subjects_no_results: string[]
        subjects_not_found: string[]
        errors?: string[]
      }
    }>('/export/containers', { ...params, count_only: true })
  },
  validateStudyCodes: (studyCodes: string[]) => {
    return api.post<{
      valid: Array<{ code: string; id: number; title?: string; lead_person?: string }>
      invalid: string[]
      total_unique: number
      valid_count: number
      invalid_count: number
    }>('/export/containers/validate-studies', { study_codes: studyCodes })
  },
  containersByNamesMultiStudy: (params: {
    entries: Array<{
      study_short_code: string
      subject_name: string
      collection_date?: string
      date_from?: string
      date_to?: string
    }>
    subject_dates?: { [subjectName: string]: { exact?: string; from?: string; to?: string } }
    date_tolerance?: number
    format?: 'csv' | 'xlsx' | 'json'
    columns?: string[]
    specimen_type_ids?: number[]
    container_types?: string[]
    tag_ids?: number[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
    csv_delimiter?: ',' | ';' | '\t'
    csv_bom?: boolean
    csv_line_ending?: 'LF' | 'CRLF'
  }) => {
    return api.post<{
      summary: {
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
      data: ContainerExportData[] | string
      format: 'csv' | 'xlsx' | 'json'
      filename?: string
    }>('/export/containers/multi-study', params)
  },
  containersCountByNamesMultiStudy: (params: {
    entries: Array<{
      study_short_code: string
      subject_name: string
      collection_date?: string
      date_from?: string
      date_to?: string
    }>
    date_tolerance?: number
    specimen_type_ids?: number[]
    container_types?: string[]
    tag_ids?: number[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
  }) => {
    return api.post<{
      count: number
      summary: {
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
    }>('/export/containers/multi-study', { ...params, count_only: true })
  },
  containersByBarcodes: (params: {
    barcodes: string[]
    format?: 'csv' | 'xlsx' | 'json'
    columns?: string[]
    csv_delimiter?: ',' | ';' | '\t'
    csv_bom?: boolean
    csv_line_ending?: 'LF' | 'CRLF'
  }) => {
    return api.post<{
      summary: {
        total_containers: number
        barcodes_found: string[]
        barcodes_not_found: string[]
      }
      data: ContainerExportData[] | string
      format: 'csv' | 'xlsx' | 'json'
      filename?: string
    }>('/export/containers/by-barcodes', params)
  },

  /** ADR-0002 POST export envelope → browser download. */
  downloadEnvelope(
    response: PostExportEnvelopeResponse,
    params: { defaultFilename: string }
  ): void {
    downloadPostExportEnvelope({
      data: response.data,
      format: response.format,
      filename: response.filename,
      defaultFilename: params.defaultFilename,
    })
  },

  /** GET export response (blob or JSON) → browser download. */
  downloadGetResponse(params: {
    response: Blob | unknown
    format: ExportDownloadFormat
    filename: string
  }): void {
    downloadGetExportResponse(params)
  },

  /** Direct blob download (e.g. command-palette specimen/inventory exports). */
  downloadBlob(blob: Blob, filename: string): void {
    downloadExportFile({ kind: 'blob', blob, filename })
  },
}

interface DerivationProperties {
  [key: string]: unknown
}
