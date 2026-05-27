import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { exportApi } from '../lib/api/export';
import {
  useExportConfigurations,
  useExportReferenceData,
} from '../hooks/useExportWorkflow'
import { PageError } from '../ui'
import { formatLocalDateTime } from '../lib/date-utils'
import {
  formatExportConfigId,
  getExportColumnsForConfigId,
} from '../lib/export-config-selection'
import { toggleArrayFilterValue } from '../lib/filter-array-toggle'
import '../styles/storage.css'

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

interface CSVRow {
  study_short_code: string
  subject_name: string
  collection_date?: string
  date_from?: string
  date_to?: string
}

export default function Export() {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [dateTolerance, setDateTolerance] = useState<number>(0)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv')
  const [error, setError] = useState<string | null>(null)
  
  // CSV export options
  const [csvDelimiter, setCsvDelimiter] = useState<',' | ';' | '\t'>(',')
  const [csvBOM, setCsvBOM] = useState<boolean>(true)
  const [csvLineEnding, setCsvLineEnding] = useState<'LF' | 'CRLF'>('CRLF')
  const [count, setCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  
  // Validation state
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    valid: Array<{ code: string; id: number; title?: string; lead_person?: string }>
    invalid: string[]
    total_unique: number
    valid_count: number
    invalid_count: number
  } | null>(null)
  
  // Export summary
  const [exportSummary, setExportSummary] = useState<{
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
  } | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  
  // Filters
  const [filters, setFilters] = useState<{
    specimen_type_ids?: number[]
    container_types?: string[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
    tag_ids?: number[]
  }>({})
  
  const [focusedConfigIndex, setFocusedConfigIndex] = useState<number | null>(null)
  const referenceData = useExportReferenceData()
  const { specimenTypes, tags, isLoading: loadingRefData } = referenceData
  const availableContainerTypes = CONTAINER_TYPES.map((t) => t.value)
  const {
    configurations: exportConfigurations,
    selectedConfigId,
    setSelectedConfigId,
    loading: loadingConfigs,
    error: configLoadError,
    loadConfigurations,
  } = useExportConfigurations()

  const bootstrapError = useMemo(() => {
    if (referenceData.isError) return referenceData.errorMessage
    if (configLoadError) return configLoadError
    return null
  }, [referenceData.isError, referenceData.errorMessage, configLoadError])

  const retryBootstrap = () => {
    referenceData.refetch()
    void loadConfigurations()
  }

  const parseCSV = useCallback((file: File) => {
    return new Promise<CSVRow[]>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          if (!text) {
            reject(new Error('File is empty'))
            return
          }

          const lines = text.split('\n').filter(line => line.trim())
          if (lines.length === 0) {
            reject(new Error('CSV file is empty'))
            return
          }

          // Parse header
          const headerLine = lines[0].trim()
          const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''))
          
          // Find column indices
          const studyCodeIdx = headers.findIndex(h => h === 'study_short_code' || h === 'study short code')
          const subjectNameIdx = headers.findIndex(h => h === 'subject_name' || h === 'subject name')
          
          if (studyCodeIdx === -1) {
            reject(new Error('CSV must contain a "study_short_code" column'))
            return
          }
          if (subjectNameIdx === -1) {
            reject(new Error('CSV must contain a "subject_name" column'))
            return
          }
          
          const collectionDateIdx = headers.findIndex(h => h === 'collection_date' || h === 'collection date')
          const dateFromIdx = headers.findIndex(h => h === 'date_from' || h === 'date from')
          const dateToIdx = headers.findIndex(h => h === 'date_to' || h === 'date to')

          // Parse data rows
          const data: CSVRow[] = []

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue

            // Simple CSV parsing (handles quoted values)
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

            const row: CSVRow = {
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
        } catch (err: any) {
          reject(new Error(`Failed to parse CSV: ${err.message}`))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }, [])

  const handleCSVUpload = useCallback(async (file: File) => {
    try {
      setCsvError(null)
      setValidationResult(null)
      setExportSummary(null)
      setSummaryExpanded(false)
      
      const data = await parseCSV(file)
      setCsvData(data)
      setCsvFile(file)
      
      // Auto-validate study codes
      const uniqueStudyCodes = [...new Set(data.map(row => row.study_short_code))]
      await validateStudyCodes(uniqueStudyCodes)
    } catch (err: any) {
      setCsvError(err.message)
      setCsvData([])
      setCsvFile(null)
      setValidationResult(null)
    }
  }, [parseCSV])

  const validateStudyCodes = useCallback(async (studyCodes: string[]) => {
    if (studyCodes.length === 0) return
    
    try {
      setValidating(true)
      setError(null)
      const response = await exportApi.validateStudyCodes(studyCodes)
      setValidationResult(response)
      
      if (response.invalid_count > 0) {
        setError(`Found ${response.invalid_count} invalid study code(s): ${response.invalid.join(', ')}`)
      }
    } catch (err: any) {
      console.error('Failed to validate study codes:', err)
      setError(err?.response?.data?.error || 'Failed to validate study codes')
    } finally {
      setValidating(false)
    }
  }, [])

  const updateCount = useCallback(
    async (getIgnore?: () => boolean) => {
      if (csvData.length === 0) {
        setCount(null)
        return
      }

      const checkIgnore = getIgnore ?? (() => false)

      try {
        setLoadingCount(true)
        setError(null)

        const response = await exportApi.containersCountByNamesMultiStudy({
          entries: csvData,
          date_tolerance: dateTolerance,
          specimen_type_ids: filters.specimen_type_ids,
          container_types: filters.container_types,
          date_from: filters.date_from,
          date_to: filters.date_to,
          created_from: filters.created_from,
          created_to: filters.created_to,
        })

        if (!checkIgnore()) {
          setCount(response.count)
        }
      } catch (error: unknown) {
        if (!checkIgnore()) {
          console.error('Failed to get count:', error)
          const err = error as { response?: { data?: { error?: string } } }
          setError(err.response?.data?.error || 'Failed to get count')
          setCount(null)
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
    if (csvData.length === 0) return
    let ignore = false
    const timer = setTimeout(() => {
      void updateCount(() => ignore)
    }, 500)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [csvData, dateTolerance, filters, updateCount])

  const handleExport = async () => {
    try {
      setExporting(true)
      setError(null)
      setExportSummary(null)

      const columns = getExportColumnsForConfigId(exportConfigurations, selectedConfigId)

      const response = await exportApi.containersByNamesMultiStudy({
        entries: csvData,
        date_tolerance: dateTolerance,
        format: exportFormat,
        columns: columns,
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
      
      const summary = response.summary
      setExportSummary(summary)

      // Handle file download
      let blob: Blob
      let filename: string

      if (typeof response.data === 'string') {
        // Base64 encoded
        const binaryString = atob(response.data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const mimeType = exportFormat === 'xlsx' 
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv'
        blob = new Blob([bytes], { type: mimeType })
      } else {
        // JSON format
        blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
      }
      
      filename = response.filename || `multi_study_export_${formatLocalDateTime()}.${exportFormat}`
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Show inline summary
      setSummaryExpanded(true)
    } catch (error: any) {
      console.error('Export failed:', error)
      setError(error.response?.data?.error || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const updateFilter = <K extends keyof typeof filters>(
    key: K,
    value: typeof filters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const toggleArrayFilter = <K extends keyof typeof filters>(
    key: K,
    value: number | string
  ) => {
    setFilters((prev) => toggleArrayFilterValue(prev, key, value))
  }

  const clearFilters = () => {
    setFilters({})
  }

  const hasActiveFilters = () => {
    return !!(
      filters.specimen_type_ids?.length ||
      filters.container_types?.length ||
      filters.date_from ||
      filters.date_to ||
      filters.created_from ||
      filters.created_to ||
      filters.tag_ids?.length
    )
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10 max-w-6xl">
        <div className="storage-card p-6 storage-reveal storage-reveal-1">
          <h1 className="text-3xl font-bold mb-6">Export Containers (Multi-Study)</h1>

          {bootstrapError && (
            <PageError
              title="Could not load export page"
              message={bootstrapError}
              onRetry={retryBootstrap}
            />
          )}

          {error && (
            <div className="mb-6 p-4 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
              {error}
            </div>
          )}

          {/* CSV Upload Section */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-app-text mb-2">
                Upload CSV File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleCSVUpload(file)
                  }
                }}
                className="file-input-accent"
              />
              <p className="mt-1 text-xs text-app-text-muted">
                CSV should contain: study_short_code (required), subject_name (required), collection_date (optional), date_from (optional), date_to (optional)
              </p>
              {csvError && (
                <div className="mt-2 p-2 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
                  {csvError}
                </div>
              )}
              {csvData.length > 0 && (
                <div className="mt-2 p-2 bg-app-trend-up/10 border border-app-trend-up rounded text-app-trend-up text-sm">
                  Successfully parsed {csvData.length} row{csvData.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Study Validation Results */}
            {validating && (
              <div className="p-3 rounded text-sm" style={{ background: 'rgb(var(--app-accent-muted))', border: '1px solid rgb(var(--app-accent) / 0.3)', color: 'rgb(var(--app-accent-hover))' }}>
                Validating study codes...
              </div>
            )}
            {validationResult && !validating && (
              <div className={`p-4 border rounded ${
                validationResult.invalid_count > 0
                  ? 'bg-app-standard-muted/50 border-app-standard'
                  : 'bg-app-trend-up/10 border-app-trend-up'
              }`}>
                <div className="text-sm font-medium mb-2 text-app-text">
                  Study Validation Results
                </div>
                <div className="text-sm space-y-1 text-app-text">
                  <div>Total unique studies: {validationResult.total_unique}</div>
                  <div className="text-app-trend-up">Valid: {validationResult.valid_count}</div>
                  {validationResult.invalid_count > 0 && (
                    <div className="text-app-trend-down">Invalid: {validationResult.invalid_count}</div>
                  )}
                  {validationResult.valid.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium mb-1">Valid Studies:</div>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.valid.map(study => (
                          <li key={study.code}>
                            {study.code} - {study.title || 'N/A'} ({study.lead_person || 'N/A'})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validationResult.invalid.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium mb-1 text-app-trend-down">Invalid Study Codes:</div>
                      <ul className="list-disc list-inside space-y-1 text-app-trend-down">
                        {validationResult.invalid.map(code => (
                          <li key={code}>{code}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-app-text mb-2">
                Date Tolerance (days)
              </label>
              <input
                type="number"
                min="0"
                value={dateTolerance}
                onChange={(e) => setDateTolerance(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                placeholder="0 (exact match)"
              />
              <p className="mt-1 text-xs text-app-text-muted">
                Applies to all subjects with collection_date. Default: 0 (exact match). Example: 2 means ±2 days.
              </p>
            </div>
          </div>

          {/* Filters Section */}
          <div className="space-y-4 mb-6">
            {/* Specimen Types */}
            <div>
              <label className="block text-sm font-medium text-app-text mb-2">
                Specimen Types
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border border-app-border rounded p-2">
                {loadingRefData ? (
                  <div className="text-sm text-app-text-muted">Loading...</div>
                ) : (
                  specimenTypes.map(type => (
                    <label key={type.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.specimen_type_ids?.includes(type.id) || false}
                        onChange={() => toggleArrayFilter('specimen_type_ids', type.id)}
                        className="rounded border-app-border text-app-accent focus:ring-app-accent"
                      />
                      <span className="text-sm text-app-text">{type.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Container Types */}
            <div>
              <label className="block text-sm font-medium text-app-text mb-2">
                Container Types
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {CONTAINER_TYPES.map(type => (
                  <label key={type.value} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.container_types?.includes(type.value) || false}
                      onChange={() => toggleArrayFilter('container_types', type.value)}
                      className="rounded border-app-border text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text">{type.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Date Ranges */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Collection Date Range
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.date_from || ''}
                    onChange={(e) => updateFilter('date_from', e.target.value || undefined)}
                    className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                  />
                  <input
                    type="date"
                    value={filters.date_to || ''}
                    onChange={(e) => updateFilter('date_to', e.target.value || undefined)}
                    className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Created Date Range
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.created_from || ''}
                    onChange={(e) => updateFilter('created_from', e.target.value || undefined)}
                    className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                  />
                  <input
                    type="date"
                    value={filters.created_to || ''}
                    onChange={(e) => updateFilter('created_to', e.target.value || undefined)}
                    className="flex-1 px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-app-text mb-2">
                Tags (optional)
              </label>
              <div className="max-h-32 overflow-y-auto border border-app-border rounded p-2">
                {loadingRefData ? (
                  <div className="text-sm text-app-text-muted">Loading...</div>
                ) : (
                  tags.map(tag => (
                    <label key={tag.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                      <input
                        type="checkbox"
                        checked={filters.tag_ids?.includes(tag.id) || false}
                        onChange={() => toggleArrayFilter('tag_ids', tag.id)}
                        className="rounded border-app-border text-app-accent focus:ring-app-accent"
                      />
                      <span className="text-sm text-app-text">{tag.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters() && (
              <div>
                <button
                  onClick={clearFilters}
                  type="button"
                  className="storage-link text-sm underline bg-transparent border-0 cursor-pointer p-0"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>

          {/* Preview Count */}
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'rgb(var(--app-surface))' }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: 'rgb(var(--app-text-muted))' }}>Matching Containers:</span>
              {loadingCount ? (
                <span className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>Calculating...</span>
              ) : (
                <span className="text-lg font-bold" style={{ color: 'rgb(var(--app-accent-hover))' }}>
                  {count !== null ? count.toLocaleString() : '—'}
                </span>
              )}
            </div>
          </div>

          {/* Export Configuration Selector */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-app-text">
                Export Configuration
              </label>
              <Link
                to="/settings?category=data-management&section=export-configurations"
                className="storage-link text-xs hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage in Settings
              </Link>
            </div>
            {loadingConfigs ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-full h-10 app-skeleton-bar rounded border border-app-border animate-pulse" />
                ))}
              </div>
            ) : exportConfigurations.length === 0 ? (
              <div className="text-sm p-3 bg-app-surface rounded border border-app-border">
                <p className="text-app-text mb-2">No export configurations available.</p>
                <Link
                  to="/settings?category=data-management&section=export-configurations"
                  className="storage-link font-medium inline-flex items-center gap-1"
                >
                  Create one in Settings
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ) : (
              <div 
                className="space-y-1.5"
                role="radiogroup"
                aria-label="Export configuration"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault()
                    const currentIndex = focusedConfigIndex ?? exportConfigurations.findIndex(c => formatExportConfigId(c.source!, c.name) === selectedConfigId)
                    let newIndex: number
                    if (e.key === 'ArrowDown') {
                      newIndex = currentIndex < exportConfigurations.length - 1 ? currentIndex + 1 : 0
                    } else {
                      newIndex = currentIndex > 0 ? currentIndex - 1 : exportConfigurations.length - 1
                    }
                    setFocusedConfigIndex(newIndex)
                    const newConfig = exportConfigurations[newIndex]
                    setSelectedConfigId(formatExportConfigId(newConfig.source!, newConfig.name))
                    // Focus the button
                    const button = e.currentTarget.children[newIndex] as HTMLElement
                    button.focus()
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (focusedConfigIndex !== null) {
                      const focusedConfig = exportConfigurations[focusedConfigIndex]
                      setSelectedConfigId(formatExportConfigId(focusedConfig.source!, focusedConfig.name))
                    }
                  }
                }}
              >
                {exportConfigurations.map((config, index) => {
                  const configId = formatExportConfigId(config.source!, config.name)
                  const isSelected = configId === selectedConfigId
                  const isFocused = focusedConfigIndex === index
                  return (
                    <button
                      key={configId} // Use unique ID to prevent duplicate keys (fixes Bug 2)
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${config.name}, ${config.source === 'personal' ? 'Personal' : 'Shared'} configuration, ${config.columns.length} columns${config.isDefault ? ', Default' : ''}`}
                      onClick={() => {
                        setSelectedConfigId(configId)
                        setFocusedConfigIndex(index)
                      }}
                      onFocus={() => setFocusedConfigIndex(index)}
                      onBlur={() => {
                        // Only clear focus if not selected (selected items should keep focus styling)
                        if (configId !== selectedConfigId) {
                          setFocusedConfigIndex(null)
                        }
                      }}
                      onMouseEnter={() => setFocusedConfigIndex(index)}
                      onMouseLeave={() => {
                        // Only clear focus if not selected (selected items should keep focus styling)
                        if (configId !== selectedConfigId) {
                          setFocusedConfigIndex(null)
                        }
                      }}
                      className={`w-full text-left px-3 py-2 border rounded transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                        isSelected
                          ? 'shadow-sm'
                          : 'border-app-border'
                      }`}
                      style={isSelected ? { borderColor: 'rgb(var(--app-accent))', background: 'rgb(var(--app-accent-muted))' } : isFocused ? { borderColor: 'rgb(var(--app-accent)/0.5)', background: 'rgb(var(--app-accent-muted)/0.7)' } : undefined}
                      title={config.columns.length > 0 ? `Columns: ${config.columns.slice(0, 5).join(', ')}${config.columns.length > 5 ? `, +${config.columns.length - 5} more` : ''}` : 'No columns'}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="font-medium text-sm truncate" style={isSelected ? { color: 'rgb(var(--app-accent-hover))' } : { color: 'rgb(var(--app-text))' }}>
                            {config.name}
                          </span>
                          {config.isDefault && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0" style={{ background: 'rgb(var(--app-accent-muted))', color: 'rgb(var(--app-accent-hover))' }} aria-label="Default configuration">
                              Default
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0 ${
                            config.source === 'personal'
                              ? 'bg-app-accent-muted text-app-accent-hover'
                              : 'bg-app-surface text-app-text-muted'
                          }`} aria-label={config.source === 'personal' ? 'Personal configuration' : 'Shared configuration'}>
                            {config.source === 'personal' ? 'Personal' : 'Shared'}
                          </span>
                          <span className="text-xs text-app-text-muted flex-shrink-0" aria-label={`${config.columns.length} columns`}>
                            {config.columns.length} cols
                          </span>
                        </div>
                        {isSelected && (
                          <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--app-accent-hover))' }} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-app-text-muted">
              Select which columns to include in the export. Configure options in Settings.
            </p>
          </div>

          {/* Export Format Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-app-text mb-2">
              Export Format
            </label>
            <div className="flex gap-4">
              {(['csv', 'xlsx', 'json'] as const).map(format => (
                <label key={format} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    value={format}
                    checked={exportFormat === format}
                    onChange={() => setExportFormat(format)}
                    className="text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text uppercase">{format}</span>
                </label>
              ))}
            </div>
          </div>

          {/* CSV Options - Only show when CSV format is selected */}
          {exportFormat === 'csv' && (
            <div className="mb-6 p-4 bg-app-surface rounded-lg border border-app-border">
              <h3 className="text-sm font-medium text-app-text mb-3">CSV Options</h3>
              
              {/* Delimiter Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-app-text mb-2">
                  Delimiter
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvDelimiter"
                      value=","
                      checked={csvDelimiter === ','}
                      onChange={() => setCsvDelimiter(',')}
                      className="text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text">Comma (,)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvDelimiter"
                      value=";"
                      checked={csvDelimiter === ';'}
                      onChange={() => setCsvDelimiter(';')}
                      className="text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text">Semicolon (;)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvDelimiter"
                      value="\t"
                      checked={csvDelimiter === '\t'}
                      onChange={() => setCsvDelimiter('\t')}
                      className="text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text">Tab</span>
                  </label>
                </div>
              </div>

              {/* UTF-8 BOM Toggle */}
              <div className="mb-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={csvBOM}
                    onChange={(e) => setCsvBOM(e.target.checked)}
                    className="text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text">Include UTF-8 BOM (recommended for Excel)</span>
                </label>
                <p className="mt-1 text-xs text-app-text-muted ml-6">
                  Helps Excel recognize UTF-8 encoding automatically
                </p>
              </div>

              {/* Line Ending Selection */}
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Line Ending
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvLineEnding"
                      value="CRLF"
                      checked={csvLineEnding === 'CRLF'}
                      onChange={() => setCsvLineEnding('CRLF')}
                      className="text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text">CRLF (Windows, recommended for Excel)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="csvLineEnding"
                      value="LF"
                      checked={csvLineEnding === 'LF'}
                      onChange={() => setCsvLineEnding('LF')}
                      className="text-app-accent focus:ring-app-accent"
                    />
                    <span className="text-sm text-app-text">LF (Unix)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Export Summary */}
          {exportSummary && (
            <div className="mb-6 border border-app-border rounded-lg overflow-hidden transition-all duration-300">
              <button
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="w-full px-4 py-3 bg-app-surface hover:bg-app-border/30 flex items-center justify-between transition-colors text-app-text"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-5 h-5 text-app-trend-up transition-transform duration-300 ${
                      summaryExpanded ? 'rotate-0' : 'rotate-180'
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-app-text">Export Summary</span>
                  <span className="text-xs text-app-text-muted ml-2">
                    ({exportSummary.total_containers.toLocaleString()} containers across {exportSummary.studies.length} studies)
                  </span>
                </div>
                <svg
                  className={`w-5 h-5 text-app-text-muted transition-transform duration-300 ${
                    summaryExpanded ? 'rotate-180' : 'rotate-0'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div
                className={`transition-all duration-300 ${
                  summaryExpanded 
                    ? 'max-h-[800px] opacity-100 overflow-y-auto' 
                    : 'max-h-0 opacity-0 overflow-hidden'
                }`}
              >
                <div className="px-4 py-4 space-y-4 bg-app-card">
                  {/* Total Containers */}
                  <div className="p-4 rounded-lg" style={{ background: 'rgb(var(--app-accent-muted))' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: 'rgb(var(--app-text-muted))' }}>Total Containers Exported:</span>
                      <span className="text-2xl font-bold" style={{ color: 'rgb(var(--app-accent-hover))' }}>
                        {exportSummary.total_containers.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Study Breakdown */}
                  {exportSummary.studies.map((study, idx) => (
                    <div key={idx} className="border border-app-border rounded-lg p-4">
                      <div className="font-medium text-app-text mb-2">
                        {study.study_code} - {study.study_title}
                      </div>
                      <div className="text-xs text-app-text-muted mb-3">Lead: {study.study_lead_person}</div>
                      
                      <div className="text-sm mb-2 text-app-text">
                        <span className="font-medium">Containers: </span>
                        <span style={{ color: 'rgb(var(--app-accent-hover))' }}>{study.containers.toLocaleString()}</span>
                      </div>

                      {study.subjects_with_results.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-app-text mb-1">
                            Subjects with Results ({study.subjects_with_results.length})
                          </div>
                          <div className="max-h-24 overflow-y-auto text-xs">
                            {study.subjects_with_results.map((item, i) => (
                              <div key={i} className="flex justify-between">
                                <span>{item.name}</span>
                                <span style={{ color: 'rgb(var(--app-accent-hover))' }}>{item.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {study.subjects_no_results.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-app-standard mb-1">
                            No Results ({study.subjects_no_results.length})
                          </div>
                          <div className="max-h-16 overflow-y-auto text-xs text-app-standard">
                            {study.subjects_no_results.join(', ')}
                          </div>
                        </div>
                      )}

                      {study.subjects_not_found.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-app-trend-down mb-1">
                            Not Found ({study.subjects_not_found.length})
                          </div>
                          <div className="max-h-16 overflow-y-auto text-xs text-app-trend-down">
                            {study.subjects_not_found.join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Invalid Study Codes */}
                  {exportSummary.invalid_study_codes.length > 0 && (
                    <div className="border border-app-trend-down rounded-lg p-4 bg-app-trend-down/10">
                      <div className="text-sm font-medium text-app-trend-down mb-2">
                        Invalid Study Codes ({exportSummary.invalid_study_codes.length})
                      </div>
                      <div className="text-xs text-app-trend-down">
                        {exportSummary.invalid_study_codes.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleExport}
              disabled={exporting || count === 0 || loadingCount || csvData.length === 0 || (validationResult?.invalid_count ?? 0) > 0}
              className="storage-btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

