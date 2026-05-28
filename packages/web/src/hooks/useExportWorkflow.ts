import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { tagsApi } from '../lib/api/reference-data'
import { collectionsApi } from '../lib/api/collections'
import { exportApi } from '../lib/api/export'
import { settingsApi, type ExportConfiguration, type ScannerConfiguration } from '../lib/api/settings'
import { formatLocalDateTime } from '../lib/date-utils'
import { formatExportConfigId } from '../lib/export-config-selection'
import { getQueryErrorMessage } from '../ui'
import { useSpecimenTypes } from './useReferenceData'

export type ExportCsvRow = {
  study_short_code: string
  subject_name: string
  collection_date?: string
  date_from?: string
  date_to?: string
}

export type ExportMultiStudyFilters = {
  specimen_type_ids?: number[]
  container_types?: string[]
  date_from?: string
  date_to?: string
  created_from?: string
  created_to?: string
  tag_ids?: number[]
}

export type ExportStudyValidationResult = {
  valid: Array<{ code: string; id: number; title?: string; lead_person?: string }>
  invalid: string[]
  total_unique: number
  valid_count: number
  invalid_count: number
}

export type ExportMultiStudySummary = {
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

export type ExportMultiStudySubmitParams = {
  columns: string[]
  exportFormat: 'csv' | 'xlsx' | 'json'
  csvDelimiter?: ',' | ';' | '\t'
  csvBOM?: boolean
  csvLineEnding?: 'LF' | 'CRLF'
}

/** Parse multi-study export CSV (UX-only; server validates study codes). */
export function parseExportCsv(file: File): Promise<ExportCsvRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        if (!text) {
          reject(new Error('File is empty'))
          return
        }

        const lines = text.split('\n').filter((line) => line.trim())
        if (lines.length === 0) {
          reject(new Error('CSV file is empty'))
          return
        }

        const headerLine = lines[0].trim()
        const headers = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))

        const studyCodeIdx = headers.findIndex((h) => h === 'study_short_code' || h === 'study short code')
        const subjectNameIdx = headers.findIndex((h) => h === 'subject_name' || h === 'subject name')

        if (studyCodeIdx === -1) {
          reject(new Error('CSV must contain a "study_short_code" column'))
          return
        }
        if (subjectNameIdx === -1) {
          reject(new Error('CSV must contain a "subject_name" column'))
          return
        }

        const collectionDateIdx = headers.findIndex((h) => h === 'collection_date' || h === 'collection date')
        const dateFromIdx = headers.findIndex((h) => h === 'date_from' || h === 'date from')
        const dateToIdx = headers.findIndex((h) => h === 'date_to' || h === 'date to')

        const data: ExportCsvRow[] = []

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          const values: string[] = []
          let current = ''
          let inQuotes = false

          for (let j = 0; j < line.length; j++) {
            const char = line[j]
            if (char === '"') {
              if (inQuotes && line[j + 1] === '"') {
                current += '"'
                j++
              } else {
                inQuotes = !inQuotes
              }
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          values.push(current.trim())

          const studyCode = values[studyCodeIdx]?.replace(/^"|"$/g, '').trim()
          const subjectName = values[subjectNameIdx]?.replace(/^"|"$/g, '').trim()

          if (!studyCode || !subjectName) continue

          const row: ExportCsvRow = {
            study_short_code: studyCode,
            subject_name: subjectName,
          }

          if (collectionDateIdx >= 0 && values[collectionDateIdx]) {
            const date = values[collectionDateIdx].replace(/^"|"$/g, '').trim()
            if (date) row.collection_date = date
          }
          if (dateFromIdx >= 0 && values[dateFromIdx]) {
            const date = values[dateFromIdx].replace(/^"|"$/g, '').trim()
            if (date) row.date_from = date
          }
          if (dateToIdx >= 0 && values[dateToIdx]) {
            const date = values[dateToIdx].replace(/^"|"$/g, '').trim()
            if (date) row.date_to = date
          }

          data.push(row)
        }

        if (data.length === 0) {
          reject(new Error('No valid data rows found in CSV'))
          return
        }

        resolve(data)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        reject(new Error(`Failed to parse CSV: ${message}`))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function downloadMultiStudyExportFile(
  response: Awaited<ReturnType<typeof exportApi.containersByNamesMultiStudy>>,
  exportFormat: 'csv' | 'xlsx' | 'json'
) {
  let blob: Blob
  const filename = response.filename || `multi_study_export_${formatLocalDateTime()}.${exportFormat}`

  if (typeof response.data === 'string') {
    const binaryString = atob(response.data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const mimeType =
      exportFormat === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv'
    blob = new Blob([bytes], { type: mimeType })
  } else {
    blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
  }

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export type ExportConfigurationWithSource = ExportConfiguration & {
  source?: 'shared' | 'personal'
}

export const exportWorkflowKeys = {
  all: ['export-workflow'] as const,
  referenceData: () => [...exportWorkflowKeys.all, 'reference-data'] as const,
  configurations: () => [...exportWorkflowKeys.all, 'configurations'] as const,
  plateScanBootstrap: () => [...exportWorkflowKeys.all, 'plate-scan-bootstrap'] as const,
}

async function fetchMergedExportConfigurations(): Promise<ExportConfigurationWithSource[]> {
  const [sharedRes, personalRes] = await Promise.all([
    settingsApi.getValue('export_configurations', { scope: 'shared' }),
    settingsApi
      .getValue('export_configurations', { scope: 'personal' })
      .catch(() => ({ configurations: [] as ExportConfiguration[] })),
  ])

  const sharedConfigs = sharedRes?.configurations ?? []
  const personalConfigs = personalRes?.configurations ?? []
  const hasPersonalDefault = personalConfigs.some((c) => c.isDefault === true)

  return [
    ...personalConfigs.map((c) => ({ ...c, source: 'personal' as const })),
    ...sharedConfigs.map((c) => ({
      ...c,
      isDefault: hasPersonalDefault ? false : c.isDefault,
      source: 'shared' as const,
    })),
  ]
}

/** Specimen types + tags for Export page filters. */
export function useExportReferenceData() {
  const specimenTypesQuery = useSpecimenTypes({ silent: true })
  const tagsQuery = useQuery({
    queryKey: [...exportWorkflowKeys.referenceData(), 'tags'] as const,
    queryFn: async () => (await tagsApi.list()).data,
  })

  const isLoading = specimenTypesQuery.isLoading || tagsQuery.isLoading
  const isError = specimenTypesQuery.isError || tagsQuery.isError
  const errorMessage = specimenTypesQuery.isError
    ? getQueryErrorMessage(specimenTypesQuery.error, 'Failed to load specimen types')
    : tagsQuery.isError
      ? getQueryErrorMessage(tagsQuery.error, 'Failed to load tags')
      : null

  const specimenTypes = (specimenTypesQuery.data ?? []).map((st) => ({
    ...st,
    created: st.created || '',
    lastUpdated: st.lastUpdated || '',
  }))

  return {
    specimenTypes,
    tags: tagsQuery.data ?? [],
    isLoading,
    isError,
    errorMessage,
    refetch: () => {
      void specimenTypesQuery.refetch()
      void tagsQuery.refetch()
    },
  }
}

export interface UseExportConfigurationsResult {
  configurations: ExportConfigurationWithSource[]
  selectedConfigId: string
  setSelectedConfigId: (id: string) => void
  loading: boolean
  error: string | null
  loadConfigurations: () => Promise<unknown>
}

/**
 * Load shared and personal export configurations, merge with source, set default selection.
 */
export function useExportConfigurations(): UseExportConfigurationsResult {
  const query = useQuery({
    queryKey: exportWorkflowKeys.configurations(),
    queryFn: fetchMergedExportConfigurations,
  })

  const [selectedConfigId, setSelectedConfigId] = useState('')

  useEffect(() => {
    const merged = query.data
    if (!merged) return
    if (merged.length === 0) {
      setSelectedConfigId('')
      return
    }
    setSelectedConfigId((prev) => {
      if (prev && merged.some((c) => formatExportConfigId(c.source!, c.name) === prev)) {
        return prev
      }
      const defaultConfig = merged.find((c) => c.isDefault)
      const pick = defaultConfig ?? merged[0]
      return formatExportConfigId(pick.source!, pick.name)
    })
  }, [query.data])

  return {
    configurations: query.data ?? [],
    selectedConfigId,
    setSelectedConfigId,
    loading: query.isLoading,
    error: query.isError
      ? getQueryErrorMessage(query.error, 'Failed to load export configurations')
      : null,
    loadConfigurations: () => query.refetch(),
  }
}

export type PlateScanPlate = { id: number; name: string }

/** Micronix plates + effective scanner configurations for plate scan validation. */
export function usePlateScanBootstrap() {
  const platesQuery = useQuery({
    queryKey: [...exportWorkflowKeys.plateScanBootstrap(), 'plates'] as const,
    queryFn: async (): Promise<PlateScanPlate[]> => {
      const res = await collectionsApi.listCollectionsByType('micronix_plate')
      return (res.collections ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      }))
    },
  })

  const scannerQuery = useQuery({
    queryKey: [...exportWorkflowKeys.plateScanBootstrap(), 'scanner-configs'] as const,
    queryFn: async (): Promise<ScannerConfiguration[]> => {
      const value = await settingsApi.getValue('scanner_configurations')
      return value?.configurations ?? []
    },
  })

  const isLoading = platesQuery.isLoading || scannerQuery.isLoading
  const isError = platesQuery.isError || scannerQuery.isError
  const errorMessage = platesQuery.isError
    ? getQueryErrorMessage(platesQuery.error, 'Failed to load plate list')
    : scannerQuery.isError
      ? getQueryErrorMessage(scannerQuery.error, 'Failed to load scanner configurations')
      : null

  return {
    plates: platesQuery.data ?? [],
    scannerConfigurations: scannerQuery.data ?? [],
    isLoading,
    isError,
    errorMessage,
    refetch: () => {
      void platesQuery.refetch()
      void scannerQuery.refetch()
    },
  }
}

/** Validate study codes, preview count, and submit multi-study container export. */
export function useExportMultiStudyWorkflow(options: {
  csvData: ExportCsvRow[]
  dateTolerance: number
  filters: ExportMultiStudyFilters
}) {
  const { csvData, dateTolerance, filters } = options

  const [validationResult, setValidationResult] = useState<ExportStudyValidationResult | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [countError, setCountError] = useState<string | null>(null)
  const [exportSummary, setExportSummary] = useState<ExportMultiStudySummary | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const validateMutation = useMutation({
    mutationFn: (studyCodes: string[]) => exportApi.validateStudyCodes(studyCodes),
    onSuccess: (response) => {
      setValidationResult(response)
      if (response.invalid_count > 0) {
        setValidationError(
          `Found ${response.invalid_count} invalid study code(s): ${response.invalid.join(', ')}`
        )
      } else {
        setValidationError(null)
      }
    },
    onError: (err: unknown) => {
      setValidationResult(null)
      setValidationError(getQueryErrorMessage(err, 'Failed to validate study codes'))
    },
  })

  const exportMutation = useMutation({
    mutationFn: async (params: ExportMultiStudySubmitParams) => {
      const response = await exportApi.containersByNamesMultiStudy({
        entries: csvData,
        date_tolerance: dateTolerance,
        format: params.exportFormat,
        columns: params.columns,
        specimen_type_ids: filters.specimen_type_ids,
        container_types: filters.container_types,
        tag_ids: filters.tag_ids,
        date_from: filters.date_from,
        date_to: filters.date_to,
        created_from: filters.created_from,
        created_to: filters.created_to,
        csv_delimiter: params.exportFormat === 'csv' ? params.csvDelimiter : undefined,
        csv_bom: params.exportFormat === 'csv' ? params.csvBOM : undefined,
        csv_line_ending: params.exportFormat === 'csv' ? params.csvLineEnding : undefined,
      })
      downloadMultiStudyExportFile(response, params.exportFormat)
      return response.summary
    },
    onSuccess: (summary) => {
      setExportSummary(summary)
      setExportError(null)
    },
    onError: (err: unknown) => {
      setExportError(getQueryErrorMessage(err, 'Export failed'))
    },
  })

  const updateCount = useCallback(
    async (getIgnore?: () => boolean) => {
      if (csvData.length === 0) {
        setCount(null)
        return
      }

      const checkIgnore = getIgnore ?? (() => false)

      try {
        setLoadingCount(true)
        setCountError(null)

        const response = await exportApi.containersCountByNamesMultiStudy({
          entries: csvData,
          date_tolerance: dateTolerance,
          specimen_type_ids: filters.specimen_type_ids,
          container_types: filters.container_types,
          tag_ids: filters.tag_ids,
          date_from: filters.date_from,
          date_to: filters.date_to,
          created_from: filters.created_from,
          created_to: filters.created_to,
        })

        if (!checkIgnore()) {
          setCount(response.count)
        }
      } catch (err: unknown) {
        if (!checkIgnore()) {
          setCount(null)
          setCountError(getQueryErrorMessage(err, 'Failed to get count'))
        }
      } finally {
        if (!checkIgnore()) {
          setLoadingCount(false)
        }
      }
    },
    [csvData, dateTolerance, filters]
  )

  useEffect(() => {
    if (csvData.length === 0) {
      setCount(null)
      return
    }
    let ignore = false
    const timer = setTimeout(() => {
      void updateCount(() => ignore)
    }, 500)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [csvData, dateTolerance, filters, updateCount])

  const validateStudyCodes = useCallback(
    (studyCodes: string[]) => {
      if (studyCodes.length === 0) return
      setValidationError(null)
      validateMutation.mutate(studyCodes)
    },
    [validateMutation]
  )

  const resetValidation = useCallback(() => {
    setValidationResult(null)
    setValidationError(null)
    validateMutation.reset()
  }, [validateMutation])

  const resetExportSummary = useCallback(() => {
    setExportSummary(null)
    setExportError(null)
    exportMutation.reset()
  }, [exportMutation])

  const exportContainers = useCallback(
    (params: ExportMultiStudySubmitParams) => {
      setExportError(null)
      setExportSummary(null)
      exportMutation.mutate(params)
    },
    [exportMutation]
  )

  const error = useMemo(
    () => validationError || countError || exportError,
    [validationError, countError, exportError]
  )

  return {
    validating: validateMutation.isPending,
    validationResult,
    validateStudyCodes,
    resetValidation,
    count,
    loadingCount,
    exporting: exportMutation.isPending,
    exportSummary,
    exportContainers,
    resetExportSummary,
    error,
  }
}
