import { useState, useEffect } from 'react'
import {
  exportApi,
  type ExportFilters,
  specimenTypesApi,
  statesApi,
  type SpecimenType,
  type State,
  type StudySubject,
} from '../lib/api'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  studyCode: string
  studyId: number
  subjects?: StudySubject[]
}

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'tube', label: 'Tube' },
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

  // Load reference data
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [states, setStates] = useState<State[]>([])
  const [availableContainerTypes, setAvailableContainerTypes] = useState<string[]>([])
  const [loadingRefData, setLoadingRefData] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadReferenceData()
      updateCount()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      // Debounce count updates
      const timer = setTimeout(() => {
        updateCount()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [filters, isOpen])

  const loadReferenceData = async () => {
    try {
      setLoadingRefData(true)
      const [availableTypesRes, statesRes] = await Promise.all([
        exportApi.availableTypes(studyCode),
        statesApi.list(),
      ])
      
      // Use only specimen types and container types that exist in this study
      setSpecimenTypes(
        (availableTypesRes.data.specimen_types || []).map(st => ({
          id: st.id,
          name: st.name,
          created: '',
          lastUpdated: '',
        }))
      )
      
      // Filter container types to only show what exists in the study
      const availableContainerTypes = availableTypesRes.data.container_types || []
      setStates(statesRes.data.states || [])
      
      // Store available container types for filtering the UI
      setAvailableContainerTypes(availableContainerTypes)
    } catch (error) {
      console.error('Failed to load reference data:', error)
    } finally {
      setLoadingRefData(false)
    }
  }

  const updateCount = async () => {
    try {
      setLoadingCount(true)
      setError(null)
      const response = await exportApi.containersCount(filters)
      setCount(response.data.count)
    } catch (error: any) {
      console.error('Failed to get count:', error)
      setError(error.response?.data?.error || 'Failed to get count')
      setCount(null)
    } finally {
      setLoadingCount(false)
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      setError(null)
      const response = await exportApi.containers(filters, exportFormat)

      // Create download link
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const extension = exportFormat === 'json' ? 'json' : exportFormat === 'xlsx' ? 'xlsx' : 'csv'
      link.download = `study_${studyCode}_export_${timestamp}.${extension}`
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Show success message briefly
      setTimeout(() => {
        onClose()
      }, 1000)
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
      filters.state_ids?.length ||
      filters.subject_ids?.length
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
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

              {/* States */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    States (optional)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-100 rounded p-2">
                    {loadingRefData ? (
                      <div className="text-sm text-gray-500">Loading...</div>
                    ) : (
                      states.map(state => (
                        <label key={state.id} className="flex items-center space-x-2 cursor-pointer mb-1">
                          <input
                            type="checkbox"
                            checked={filters.state_ids?.includes(state.id) || false}
                            onChange={() => toggleArrayFilter('state_ids', state.id)}
                            className="rounded border-gray-100 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{state.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Subjects */}
              {subjects.length > 0 && (
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
                disabled={exporting || count === 0 || loadingCount}
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

