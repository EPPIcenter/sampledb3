import { useCallback, useEffect, useRef, useState } from 'react'
import { exportApi, type ExportFilters } from '../lib/api/export'
import { parseExportModalCsv, type SingleStudyExportCsvRow } from '../lib/export-filter-csv'
import { formatLocalDateTime } from '../lib/date-utils'
import { downloadGetExportResponse, downloadPostExportEnvelope } from '../lib/export-download'
import { toggleArrayFilterValue } from '../lib/filter-array-toggle'

export type SingleStudyExportSummary = {
  total_containers: number
  subjects_with_results: Array<{ name: string; count: number }>
  subjects_no_results: string[]
  subjects_not_found: string[]
  errors?: string[]
}

export type SingleStudyExportSubmitParams = {
  columns: string[]
}

function buildSubjectDatesFromCsv(csvData: SingleStudyExportCsvRow[]) {
  const subjectDates: { [key: string]: { exact?: string; from?: string; to?: string } } = {}
  for (const row of csvData) {
    if (row.collection_date) {
      subjectDates[row.subject_name] = { exact: row.collection_date }
    } else if (row.date_from || row.date_to) {
      subjectDates[row.subject_name] = {
        from: row.date_from,
        to: row.date_to,
      }
    }
  }
  return Object.keys(subjectDates).length > 0 ? subjectDates : undefined
}

export function useSingleStudyExportWorkflow(options: {
  studyCode: string
  isOpen: boolean
}) {
  const { studyCode, isOpen } = options

  const [filters, setFilters] = useState<ExportFilters>({ study: studyCode })
  const [count, setCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv')
  const [error, setError] = useState<string | null>(null)
  const [csvDelimiter, setCsvDelimiter] = useState<',' | ';' | '\t'>(',')
  const [csvBOM, setCsvBOM] = useState(true)
  const [csvLineEnding, setCsvLineEnding] = useState<'LF' | 'CRLF'>('CRLF')
  const [uploadMode, setUploadMode] = useState<'manual' | 'csv'>('manual')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<SingleStudyExportCsvRow[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [dateTolerance, setDateTolerance] = useState(0)
  const [exportSummary, setExportSummary] = useState<SingleStudyExportSummary | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  const countDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateCountRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const updateCount = useCallback(async () => {
    if (uploadMode === 'csv' && csvData.length === 0) {
      setCount(null)
      return
    }

    try {
      setLoadingCount(true)
      setError(null)

      if (uploadMode === 'csv') {
        const response = await exportApi.containersCountByNames({
          study: studyCode,
          subject_names: csvData.map((row) => row.subject_name),
          subject_dates: buildSubjectDatesFromCsv(csvData),
          date_tolerance: dateTolerance,
          specimen_type_ids: filters.specimen_type_ids,
          container_types: filters.container_types,
          date_from: filters.date_from,
          date_to: filters.date_to,
          created_from: filters.created_from,
          created_to: filters.created_to,
        })
        setCount(response.count)
      } else {
        const response = await exportApi.containersCount(filters)
        setCount(response.count)
      }
    } catch (err: unknown) {
      console.error('Failed to get count:', err)
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(message || 'Failed to get count')
      setCount(null)
    } finally {
      setLoadingCount(false)
    }
  }, [filters, uploadMode, csvData, dateTolerance, studyCode])

  updateCountRef.current = updateCount

  const scheduleUpdateCount = useCallback(() => {
    if (countDebounceTimerRef.current) {
      clearTimeout(countDebounceTimerRef.current)
      countDebounceTimerRef.current = null
    }
    countDebounceTimerRef.current = setTimeout(() => {
      void updateCountRef.current()
      countDebounceTimerRef.current = null
    }, 500)
  }, [])

  const handleCSVUpload = useCallback(
    async (file: File) => {
      try {
        setCsvError(null)
        const data = await parseExportModalCsv(file)
        setCsvData(data)
        setCsvFile(file)
        setExportSummary(null)
        setSummaryExpanded(false)
        scheduleUpdateCount()
      } catch (err: unknown) {
        setCsvError(err instanceof Error ? err.message : 'Failed to parse CSV')
        setCsvData([])
        setCsvFile(null)
      }
    },
    [scheduleUpdateCount]
  )

  const switchUploadMode = useCallback(
    (mode: 'manual' | 'csv') => {
      setUploadMode(mode)
      scheduleUpdateCount()
    },
    [scheduleUpdateCount]
  )

  const updateDateTolerance = useCallback(
    (value: number) => {
      setDateTolerance(Math.max(0, value))
      scheduleUpdateCount()
    },
    [scheduleUpdateCount]
  )

  useEffect(() => {
    if (!isOpen) {
      if (countDebounceTimerRef.current) {
        clearTimeout(countDebounceTimerRef.current)
        countDebounceTimerRef.current = null
      }
      return
    }

    setError(null)
    setFilters({ study: studyCode })
    setUploadMode('manual')
    setCsvFile(null)
    setCsvData([])
    setCsvError(null)
    setDateTolerance(0)
    setExportSummary(null)
    setSummaryExpanded(false)
    void updateCountRef.current()
  }, [isOpen, studyCode])

  const updateFilter = useCallback(
    <K extends keyof ExportFilters>(key: K, value: ExportFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }))
      scheduleUpdateCount()
    },
    [scheduleUpdateCount]
  )

  const toggleArrayFilter = useCallback(
    <K extends keyof ExportFilters>(key: K, value: number | string) => {
      setFilters((prev) => toggleArrayFilterValue(prev, key, value))
      scheduleUpdateCount()
    },
    [scheduleUpdateCount]
  )

  const clearFilters = useCallback(() => {
    setFilters({ study: studyCode })
    scheduleUpdateCount()
  }, [studyCode, scheduleUpdateCount])

  const hasActiveFilters = useCallback(() => {
    return !!(
      filters.specimen_type_ids?.length ||
      filters.container_types?.length ||
      filters.date_from ||
      filters.date_to ||
      filters.created_from ||
      filters.created_to ||
      filters.tag_ids?.length ||
      filters.subject_ids?.length
    )
  }, [filters])

  const submitExport = useCallback(
    async (params: SingleStudyExportSubmitParams): Promise<'summary' | 'close'> => {
      try {
        setExporting(true)
        setError(null)
        setExportSummary(null)

        if (uploadMode === 'csv') {
          const response = await exportApi.containersByNames({
            study: studyCode,
            subject_names: csvData.map((row) => row.subject_name),
            subject_dates: buildSubjectDatesFromCsv(csvData),
            date_tolerance: dateTolerance,
            format: exportFormat,
            columns: params.columns,
            specimen_type_ids: filters.specimen_type_ids,
            container_types: filters.container_types,
            date_from: filters.date_from,
            date_to: filters.date_to,
            created_from: filters.created_from,
            created_to: filters.created_to,
            csv_delimiter: exportFormat === 'csv' ? csvDelimiter : undefined,
            csv_bom: exportFormat === 'csv' ? csvBOM : undefined,
            csv_line_ending: exportFormat === 'csv' ? csvLineEnding : undefined,
          })

          setExportSummary(response.summary)
          downloadPostExportEnvelope({
            data: response.data,
            format: exportFormat,
            filename: response.filename,
            defaultFilename: `study_${studyCode}_export_${formatLocalDateTime()}.${exportFormat}`,
          })
          setSummaryExpanded(true)
          return 'summary'
        }

        const csvOptions =
          exportFormat === 'csv'
            ? {
                delimiter: csvDelimiter,
                includeBOM: csvBOM,
                lineEnding: csvLineEnding,
              }
            : undefined

        const response = await exportApi.containers(
          filters,
          exportFormat,
          params.columns,
          csvOptions
        )

        const timestamp = formatLocalDateTime()
        const extension = exportFormat === 'json' ? 'json' : exportFormat === 'xlsx' ? 'xlsx' : 'csv'
        downloadGetExportResponse({
          response,
          format: exportFormat,
          filename: `study_${studyCode}_export_${timestamp}.${extension}`,
        })
        return 'close'
      } catch (err: unknown) {
        console.error('Export failed:', err)
        const message =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined
        setError(message || 'Export failed')
        return 'close'
      } finally {
        setExporting(false)
      }
    },
    [
      uploadMode,
      studyCode,
      csvData,
      dateTolerance,
      exportFormat,
      csvDelimiter,
      csvBOM,
      csvLineEnding,
      filters,
    ]
  )

  return {
    filters,
    count,
    loadingCount,
    exporting,
    exportFormat,
    setExportFormat,
    error,
    csvDelimiter,
    setCsvDelimiter,
    csvBOM,
    setCsvBOM,
    csvLineEnding,
    setCsvLineEnding,
    uploadMode,
    switchUploadMode,
    csvFile,
    csvData,
    csvError,
    dateTolerance,
    updateDateTolerance,
    exportSummary,
    summaryExpanded,
    setSummaryExpanded,
    handleCSVUpload,
    updateFilter,
    toggleArrayFilter,
    clearFilters,
    hasActiveFilters,
    submitExport,
    refreshCount: updateCount,
  }
}
