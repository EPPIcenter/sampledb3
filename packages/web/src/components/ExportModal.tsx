import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  exportApi,
  exportConfigurationsApi,
  type ExportFilters,
  specimenTypesApi,
  tagsApi,
  type SpecimenType,
  type Tag,
  type StudySubject,
  type ExportConfiguration,
} from '../lib/api'
import { useModifierHotkey } from '../hooks/useHotkey'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  studyCode: string
  studyId: number
  subjects?: StudySubject[]
}

/**
 * Format a date as a filesystem-safe local datetime string
 * Format: YYYY-MM-DD_HH-MM-SS (e.g., "2026-01-27_14-30-45")
 */
function formatLocalDateTime(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

export default function ExportModal({
  isOpen,
  onClose,
  studyCode,
  studyId,
  subjects = [],
}: ExportModalProps) {
  const [filters, setFilters] = useState<ExportFilters>({
    study: studyCode,
  })
  const [count, setCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv')
  const [error, setError] = useState<string | null>(null)
  
  // CSV export options
  const [csvDelimiter, setCsvDelimiter] = useState<',' | ';' | '\t'>(',')
  const [csvBOM, setCsvBOM] = useState<boolean>(true)
  const [csvLineEnding, setCsvLineEnding] = useState<'LF' | 'CRLF'>('CRLF')
  
  // CSV upload mode
  const [uploadMode, setUploadMode] = useState<'manual' | 'csv'>('manual')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<Array<{
    subject_name: string
    collection_date?: string
    date_from?: string
    date_to?: string
  }>>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [dateTolerance, setDateTolerance] = useState<number>(0)
  const [exportSummary, setExportSummary] = useState<{
    total_containers: number
    subjects_with_results: Array<{ name: string; count: number }>
    subjects_no_results: string[]
    subjects_not_found: string[]
    errors?: string[]
  } | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  // Load reference data
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [availableContainerTypes, setAvailableContainerTypes] = useState<string[]>([])
  const [loadingRefData, setLoadingRefData] = useState(true)
  const [exportConfigurations, setExportConfigurations] = useState<Array<ExportConfiguration & { source?: 'shared' | 'personal' }>>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string>('') // Format: "source:name" to ensure uniqueness
  const [loadingConfigs, setLoadingConfigs] = useState(false)
  const [focusedConfigIndex, setFocusedConfigIndex] = useState<number | null>(null)

  const loadReferenceData = useCallback(async () => {
    try {
      setLoadingRefData(true)
      setError(null)
      const [availableTypesRes, tagsRes] = await Promise.all([
        exportApi.availableTypes(studyCode),
        tagsApi.list(),
      ])
      
      // Safely extract data with null checks
      const availableTypesData = availableTypesRes?.data
      const tagsData = tagsRes.data // tagsApi.list() returns { data: Tag[] }
      
      if (!availableTypesData) {
        throw new Error('Invalid response from server: missing data')
      }
      
      // Use only specimen types and container types that exist in this study
      const specimenTypesData = Array.isArray(availableTypesData.specimen_types) 
        ? availableTypesData.specimen_types 
        : []
      
      setSpecimenTypes(
        specimenTypesData.map(st => ({
          id: st.id,
          name: st.name,
          created: '',
          lastUpdated: '',
        }))
      )
      
      // Filter container types to only show what exists in the study
      const availableContainerTypes = Array.isArray(availableTypesData.container_types)
        ? availableTypesData.container_types
        : []
      setTags(tagsData)
      
      // Store available container types for filtering the UI
      setAvailableContainerTypes(availableContainerTypes)
    } catch (error: any) {
      console.error('Failed to load reference data:', error)
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to load export options'
      setError(errorMessage)
      // Set empty arrays to prevent render errors
      setSpecimenTypes([])
      setTags([])
      setAvailableContainerTypes([])
    } finally {
      setLoadingRefData(false)
    }
  }, [studyCode])

  const loadExportConfigurations = useCallback(async () => {
    try {
      setLoadingConfigs(true)
      // Load shared and personal configs separately to track source
      const [sharedRes, personalRes] = await Promise.all([
        exportConfigurationsApi.getShared(),
        exportConfigurationsApi.getPersonal().catch(() => ({ data: { configurations: [] } })),
      ])
      
      const sharedConfigs = sharedRes.data?.configurations || []
      const personalConfigs = personalRes.data?.configurations || []
      
      // Check if user has a personal default
      const hasPersonalDefault = personalConfigs.some(c => c.isDefault === true)
      
      // Merge: personal first, then shared (with default flag removed from shared if personal default exists)
      const mergedConfigs = [
        ...personalConfigs.map(c => ({
          ...c,
          source: 'personal' as const,
        })),
        ...sharedConfigs.map(c => ({
          ...c,
          isDefault: hasPersonalDefault ? false : c.isDefault,
          source: 'shared' as const,
        })),
      ]
      
      // Always update state, even if empty (fixes Bug 1: stale data when all configs deleted)
      setExportConfigurations(mergedConfigs)
      
      if (mergedConfigs.length > 0) {
        // Set default config if available - backend ensures only one default exists (personal preferred)
        const defaultConfig = mergedConfigs.find(c => c.isDefault)
        if (defaultConfig) {
          setSelectedConfigId(`${defaultConfig.source}:${defaultConfig.name}`)
        } else {
          setSelectedConfigId(`${mergedConfigs[0].source}:${mergedConfigs[0].name}`)
        }
      } else {
        // Clear selection when no configs available
        setSelectedConfigId('')
      }
    } catch (err: any) {
      console.error('Failed to load export configurations:', err)
    } finally {
      setLoadingConfigs(false)
    }
  }, [])

  const parseCSV = useCallback((file: File) => {
    return new Promise<Array<{
      subject_name: string
      collection_date?: string
      date_from?: string
      date_to?: string
    }>>((resolve, reject) => {
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
          const subjectNameIdx = headers.findIndex(h => h === 'subject_name' || h === 'subject name')
          if (subjectNameIdx === -1) {
            reject(new Error('CSV must contain a "subject_name" column'))
            return
          }
          
          const collectionDateIdx = headers.findIndex(h => h === 'collection_date' || h === 'collection date')
          const dateFromIdx = headers.findIndex(h => h === 'date_from' || h === 'date from')
          const dateToIdx = headers.findIndex(h => h === 'date_to' || h === 'date to')

          // Parse data rows
          const data: Array<{
            subject_name: string
            collection_date?: string
            date_from?: string
            date_to?: string
          }> = []

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

            const subjectName = values[subjectNameIdx]?.replace(/^"|"$/g, '').trim()
            if (!subjectName) continue

            const row: {
              subject_name: string
              collection_date?: string
              date_from?: string
              date_to?: string
            } = { subject_name: subjectName }

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
      const data = await parseCSV(file)
      setCsvData(data)
      setCsvFile(file)
      // Clear summary when CSV is replaced
      setExportSummary(null)
      setSummaryExpanded(false)
    } catch (err: any) {
      setCsvError(err.message)
      setCsvData([])
      setCsvFile(null)
    }
  }, [parseCSV])

  const updateCount = useCallback(async () => {
    if (uploadMode === 'csv' && csvData.length === 0) {
      setCount(null)
      return
    }

    try {
      setLoadingCount(true)
      setError(null)
      
      if (uploadMode === 'csv') {
        // Build subject dates from CSV data
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

        const response = await exportApi.containersCountByNames({
          study: studyCode,
          subject_names: csvData.map(row => row.subject_name),
          subject_dates: Object.keys(subjectDates).length > 0 ? subjectDates : undefined,
          date_tolerance: dateTolerance,
          specimen_type_ids: filters.specimen_type_ids,
          container_types: filters.container_types,
          date_from: filters.date_from,
          date_to: filters.date_to,
          created_from: filters.created_from,
          created_to: filters.created_to,
        })
        setCount(response.data.count)
      } else {
        const response = await exportApi.containersCount(filters)
        setCount(response.data.count)
      }
    } catch (error: any) {
      console.error('Failed to get count:', error)
      setError(error.response?.data?.error || 'Failed to get count')
      setCount(null)
    } finally {
      setLoadingCount(false)
    }
  }, [filters, uploadMode, csvData, dateTolerance, studyCode])

  useEffect(() => {
    if (isOpen) {
      loadReferenceData()
      loadExportConfigurations()
      // Initial count load
      updateCount()
    } else {
      // Reset state when modal closes
      setError(null)
      setFilters({ study: studyCode })
      setUploadMode('manual')
      setCsvFile(null)
      setCsvData([])
      setCsvError(null)
      setDateTolerance(0)
      setExportSummary(null)
      setSummaryExpanded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, studyCode])

  useEffect(() => {
    if (isOpen) {
      // Debounce count updates when filters change
      const timer = setTimeout(() => {
        updateCount()
      }, 500)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, isOpen, uploadMode, csvData, dateTolerance])

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Cmd/Ctrl+Enter to trigger export
  useModifierHotkey('enter', (e) => {
    if (isOpen && !exporting && count !== 0 && !loadingCount) {
      e.preventDefault()
      handleExport()
    }
  }, { enabled: isOpen, preventDefault: true })

  const handleExport = async () => {
    try {
      setExporting(true)
      setError(null)
      setExportSummary(null)

      let response: any
      let summary: any

      if (uploadMode === 'csv') {
        // Build subject dates from CSV data
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

        response = await exportApi.containersByNames({
          study: studyCode,
          subject_names: csvData.map(row => row.subject_name),
          subject_dates: Object.keys(subjectDates).length > 0 ? subjectDates : undefined,
          date_tolerance: dateTolerance,
          format: exportFormat,
          columns: (() => {
            // Split on first colon only to handle config names that contain colons
            const firstColonIndex = selectedConfigId.indexOf(':')
            const selectedSource = selectedConfigId.substring(0, firstColonIndex)
            const selectedName = selectedConfigId.substring(firstColonIndex + 1)
            return exportConfigurations.find(c => c.source === selectedSource && c.name === selectedName)?.columns
          })(),
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
        summary = response.data.summary
        setExportSummary(summary)
      } else {
        const csvOptions = exportFormat === 'csv' ? {
          delimiter: csvDelimiter,
          includeBOM: csvBOM,
          lineEnding: csvLineEnding,
        } : undefined
        // Split on first colon only to handle config names that contain colons
        const firstColonIndex = selectedConfigId.indexOf(':')
        const selectedSource = selectedConfigId.substring(0, firstColonIndex)
        const selectedName = selectedConfigId.substring(firstColonIndex + 1)
        const selectedConfig = exportConfigurations.find(c => c.source === selectedSource && c.name === selectedName)
        response = await exportApi.containers(filters, exportFormat, selectedConfig?.columns, csvOptions)
        summary = null
      }

      // Handle file download
      let blob: Blob
      let filename: string

      if (uploadMode === 'csv' && response.data.data) {
        // Handle base64 encoded data for CSV/XLSX
        if (typeof response.data.data === 'string') {
          // Base64 encoded
          const binaryString = atob(response.data.data)
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
          blob = new Blob([JSON.stringify(response.data.data, null, 2)], { type: 'application/json' })
        }
        filename = response.data.filename || `study_${studyCode}_export_${formatLocalDateTime()}.${exportFormat}`
      } else {
        // Manual mode - existing behavior
        blob = response.data instanceof Blob
          ? response.data
          : new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
        const timestamp = formatLocalDateTime()
        const extension = exportFormat === 'json' ? 'json' : exportFormat === 'xlsx' ? 'xlsx' : 'csv'
        filename = `study_${studyCode}_export_${timestamp}.${extension}`
      }
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Show inline summary if CSV mode
      if (uploadMode === 'csv' && summary) {
        setSummaryExpanded(true)
      } else {
        // Show success message briefly
        setTimeout(() => {
          onClose()
        }, 1000)
      }
    } catch (error: any) {
      console.error('Export failed:', error)
      setError(error.response?.data?.error || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const updateFilter = <K extends keyof ExportFilters>(
    key: K,
    value: ExportFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const toggleArrayFilter = <K extends keyof ExportFilters>(
    key: K,
    value: number | string
  ) => {
    setFilters(prev => {
      const current = (prev[key] as any[]) || []
      const index = current.indexOf(value)
      if (index >= 0) {
        return { ...prev, [key]: current.filter(v => v !== value) }
      } else {
        return { ...prev, [key]: [...current, value] }
      }
    })
  }

  const clearFilters = () => {
    setFilters({ study: studyCode })
  }

  const hasActiveFilters = () => {
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
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">Export Study Data</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Tab Selection */}
            <div className="mb-6 border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setUploadMode('manual')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    uploadMode === 'manual'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Manual Selection
                </button>
                <button
                  onClick={() => setUploadMode('csv')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    uploadMode === 'csv'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  CSV Upload
                </button>
              </nav>
            </div>

            {/* CSV Upload Section */}
            {uploadMode === 'csv' && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    CSV should contain: subject_name (required), collection_date (optional), date_from (optional), date_to (optional)
                  </p>
                  {csvError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                      {csvError}
                    </div>
                  )}
                  {csvData.length > 0 && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
                      Successfully parsed {csvData.length} subject{csvData.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date Tolerance (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={dateTolerance}
                    onChange={(e) => setDateTolerance(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0 (exact match)"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Applies to all subjects with collection_date. Default: 0 (exact match). Example: 2 means ±2 days.
                  </p>
                </div>
              </div>
            )}

            {/* Filters Section */}
            <div className="space-y-4 mb-6">
              {/* Specimen Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Specimen Types
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border border-gray-100 rounded p-2">
                  {loadingRefData ? (
                    <div className="text-sm text-gray-500">Loading...</div>
                  ) : (
                    specimenTypes.map(type => (
                      <label key={type.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.specimen_type_ids?.includes(type.id) || false}
                          onChange={() => toggleArrayFilter('specimen_type_ids', type.id)}
                          className="rounded border-gray-100 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{type.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Container Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Container Types
                </label>
                {availableContainerTypes.length === 0 ? (
                  <div className="text-sm text-gray-500 italic">
                    No containers found in this study
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {CONTAINER_TYPES.filter(type => availableContainerTypes.includes(type.value)).map(type => (
                      <label key={type.value} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.container_types?.includes(type.value) || false}
                          onChange={() => toggleArrayFilter('container_types', type.value)}
                          className="rounded border-gray-100 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{type.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Date Ranges */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Collection Date Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={filters.date_from || ''}
                      onChange={(e) => updateFilter('date_from', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <input
                      type="date"
                      value={filters.date_to || ''}
                      onChange={(e) => updateFilter('date_to', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Created Date Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={filters.created_from || ''}
                      onChange={(e) => updateFilter('created_from', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <input
                      type="date"
                      value={filters.created_to || ''}
                      onChange={(e) => updateFilter('created_to', e.target.value || undefined)}
                      className="flex-1 px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tags (optional)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-100 rounded p-2">
                    {loadingRefData ? (
                      <div className="text-sm text-gray-500">Loading...</div>
                    ) : (
                      tags.map(tag => (
                        <label key={tag.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                          <input
                            type="checkbox"
                            checked={filters.tag_ids?.includes(tag.id) || false}
                            onChange={() => toggleArrayFilter('tag_ids', tag.id)}
                            className="rounded border-gray-100 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{tag.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Subjects - Only show in manual mode */}
              {uploadMode === 'manual' && subjects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subjects (optional)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-100 rounded p-2">
                    {subjects.map(subject => (
                      <label key={subject.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                        <input
                          type="checkbox"
                          checked={filters.subject_ids?.includes(subject.id) || false}
                          onChange={() => toggleArrayFilter('subject_ids', subject.id)}
                          className="rounded border-gray-100 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{subject.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear Filters Button */}
              {hasActiveFilters() && (
                <div>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>

            {/* Preview Count */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Matching Containers:</span>
                {loadingCount ? (
                  <span className="text-sm text-gray-500">Calculating...</span>
                ) : (
                  <span className="text-lg font-bold text-blue-600">
                    {count !== null ? count.toLocaleString() : '—'}
                  </span>
                )}
              </div>
            </div>

            {/* Export Configuration Selector */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Export Configuration
                </label>
                <Link
                  to="/settings?category=data-management&section=export-configurations"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
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
                    <div key={i} className="w-full h-10 bg-gray-100 rounded border border-gray-200 animate-pulse" />
                  ))}
                </div>
              ) : exportConfigurations.length === 0 ? (
                <div className="text-sm p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="text-gray-700 mb-2">No export configurations available.</p>
                  <Link
                    to="/settings?category=data-management&section=export-configurations"
                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-1"
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
                      const currentIndex = focusedConfigIndex ?? exportConfigurations.findIndex(c => `${c.source}:${c.name}` === selectedConfigId)
                      let newIndex: number
                    if (e.key === 'ArrowDown') {
                      newIndex = currentIndex < exportConfigurations.length - 1 ? currentIndex + 1 : 0
                    } else {
                      newIndex = currentIndex > 0 ? currentIndex - 1 : exportConfigurations.length - 1
                    }
                    setFocusedConfigIndex(newIndex)
                    const newConfig = exportConfigurations[newIndex]
                    setSelectedConfigId(`${newConfig.source}:${newConfig.name}`)
                    const button = e.currentTarget.children[newIndex] as HTMLElement
                    button?.focus()
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (focusedConfigIndex !== null) {
                      const focusedConfig = exportConfigurations[focusedConfigIndex]
                      setSelectedConfigId(`${focusedConfig.source}:${focusedConfig.name}`)
                    }
                  }
                  }}
                >
                  {exportConfigurations.map((config, index) => {
                    const configId = `${config.source}:${config.name}` // Unique ID combining source and name
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
                        className={`w-full text-left px-3 py-2 border rounded transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : isFocused
                            ? 'border-blue-300 bg-blue-50/70'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                        title={config.columns.length > 0 ? `Columns: ${config.columns.slice(0, 5).join(', ')}${config.columns.length > 5 ? `, +${config.columns.length - 5} more` : ''}` : 'No columns'}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className={`font-medium text-sm truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                              {config.name}
                            </span>
                            {config.isDefault && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded flex-shrink-0" aria-label="Default configuration">
                                Default
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0 ${
                              config.source === 'personal'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-700'
                            }`} aria-label={config.source === 'personal' ? 'Personal configuration' : 'Shared configuration'}>
                              {config.source === 'personal' ? 'Personal' : 'Shared'}
                            </span>
                            <span className="text-xs text-gray-500 flex-shrink-0" aria-label={`${config.columns.length} columns`}>
                              {config.columns.length} cols
                            </span>
                          </div>
                          {isSelected && (
                            <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Select which columns to include in the export. Configure options in Settings.
              </p>
            </div>

            {/* Export Format Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 uppercase">{format}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* CSV Options - Only show when CSV format is selected */}
            {exportFormat === 'csv' && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-3">CSV Options</h3>
                
                {/* Delimiter Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Comma (,)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvDelimiter"
                        value=";"
                        checked={csvDelimiter === ';'}
                        onChange={() => setCsvDelimiter(';')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Semicolon (;)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvDelimiter"
                        value="\t"
                        checked={csvDelimiter === '\t'}
                        onChange={() => setCsvDelimiter('\t')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Tab</span>
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
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Include UTF-8 BOM (recommended for Excel)</span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500 ml-6">
                    Helps Excel recognize UTF-8 encoding automatically
                  </p>
                </div>

                {/* Line Ending Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">CRLF (Windows, recommended for Excel)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="csvLineEnding"
                        value="LF"
                        checked={csvLineEnding === 'LF'}
                        onChange={() => setCsvLineEnding('LF')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">LF (Unix)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Inline Export Summary - Only show for CSV mode */}
            {uploadMode === 'csv' && exportSummary && (
              <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden transition-all duration-300">
                <button
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                  className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className={`w-5 h-5 text-green-600 transition-transform duration-300 ${
                        summaryExpanded ? 'rotate-0' : 'rotate-180'
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">Export Summary</span>
                    <span className="text-xs text-gray-500 ml-2">
                      ({exportSummary.total_containers.toLocaleString()} containers)
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${
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
                  className={`overflow-hidden transition-all duration-300 ${
                    summaryExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-4 py-4 space-y-4 bg-white">
                    {/* Total Containers */}
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Total Containers Exported:</span>
                        <span className="text-2xl font-bold text-blue-600">
                          {exportSummary.total_containers.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Subjects with Results */}
                    {exportSummary.subjects_with_results.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Subjects with Results ({exportSummary.subjects_with_results.length})
                        </h4>
                        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
                          {exportSummary.subjects_with_results.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 text-sm">
                              <span className="text-gray-700">{item.name}</span>
                              <span className="font-medium text-blue-600">
                                {item.count.toLocaleString()} container{item.count !== 1 ? 's' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Subjects with No Results */}
                    {exportSummary.subjects_no_results.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-yellow-700 mb-2">
                          Subjects with No Results ({exportSummary.subjects_no_results.length})
                        </h4>
                        <div className="max-h-32 overflow-y-auto border border-yellow-200 rounded p-2 bg-yellow-50">
                          {exportSummary.subjects_no_results.map((name, idx) => (
                            <div key={idx} className="text-sm text-yellow-700 py-1">
                              {name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Subjects Not Found */}
                    {exportSummary.subjects_not_found.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-red-700 mb-2">
                          Subjects Not Found ({exportSummary.subjects_not_found.length})
                        </h4>
                        <div className="max-h-32 overflow-y-auto border border-red-200 rounded p-2 bg-red-50">
                          {exportSummary.subjects_not_found.map((name, idx) => (
                            <div key={idx} className="text-sm text-red-700 py-1">
                              {name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Errors */}
                    {exportSummary.errors && exportSummary.errors.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-red-700 mb-2">Errors</h4>
                        <div className="border border-red-200 rounded p-2 bg-red-50">
                          {exportSummary.errors.map((error, idx) => (
                            <div key={idx} className="text-sm text-red-700 py-1">
                              {error}
                            </div>
                          ))}
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
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-100 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || count === 0 || loadingCount || (uploadMode === 'csv' && csvData.length === 0)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

