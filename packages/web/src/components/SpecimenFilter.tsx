import { useState, useEffect, useMemo } from 'react'
import { studiesApi, type Study } from '../lib/api'
import { specimenTypesApi, type SpecimenType } from '../lib/api'

export interface SpecimenFilters {
  study?: string
  sourceType?: string
  specimenTypeId?: string
  collectionDateFrom?: string
  collectionDateTo?: string
  createdFrom?: string
  createdTo?: string
  search?: string
}

interface SpecimenFilterProps {
  filters: SpecimenFilters
  onChange: (filters: SpecimenFilters) => void
  onSubmit: (filters: SpecimenFilters) => void
  isLoading?: boolean
}

const SOURCE_TYPES = [
  { value: '', label: 'All Sources' },
  { value: 'subject', label: 'Subject' },
  { value: 'control', label: 'Control' },
]

export default function SpecimenFilter({ filters, onChange, onSubmit, isLoading = false }: SpecimenFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<SpecimenFilters>(filters)
  const [studies, setStudies] = useState<Study[]>([])
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [loading, setLoading] = useState(false)
  const [studyPickerOpen, setStudyPickerOpen] = useState(false)
  const [studySearch, setStudySearch] = useState('')
  const [studyLoading, setStudyLoading] = useState(false)

  // Sync local filters when external filters change
  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  useEffect(() => {
    if (isOpen) {
      loadReferenceData()
    }
  }, [isOpen])

  const loadReferenceData = async () => {
    try {
      setLoading(true)
      const [specimenTypesRes] = await Promise.all([
        specimenTypesApi.list().catch(() => ({ data: { specimenTypes: [] } })),
      ])
      setSpecimenTypes(specimenTypesRes.data.specimenTypes || [])
    } catch (error) {
      console.error('Failed to load reference data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (studyPickerOpen) {
      void loadStudies()
    }
  }, [studyPickerOpen])

  useEffect(() => {
    if (!studyPickerOpen) return
    const timeout = setTimeout(() => {
      void loadStudies()
    }, 300)
    return () => clearTimeout(timeout)
  }, [studySearch])

  const loadStudies = async () => {
    try {
      setStudyLoading(true)
      const response = await studiesApi.list(studySearch || undefined)
      setStudies(response.data.studies || [])
    } catch (error) {
      console.error('Failed to load studies:', error)
    } finally {
      setStudyLoading(false)
    }
  }

  const selectedStudy = studies.find((s) => s.shortCode === localFilters.study)

  const updateFilter = (key: keyof SpecimenFilters, value: string) => {
    const newFilters = { ...localFilters }
    if (value === '') {
      delete newFilters[key]
    } else {
      newFilters[key] = value
    }
    setLocalFilters(newFilters)
    onChange(newFilters)
  }

  const handleSubmit = () => {
    onSubmit(localFilters)
  }

  const clearFilters = () => {
    const emptyFilters: SpecimenFilters = {}
    setLocalFilters(emptyFilters)
    onChange(emptyFilters)
    onSubmit(emptyFilters)
  }

  const activeFilterCount = Object.entries(localFilters).filter(([k, v]) => k !== 'search' && v !== undefined && v !== null && v !== '').length
  const hasActiveFilters = activeFilterCount > 0
  const hasChanges = JSON.stringify(localFilters) !== JSON.stringify(filters)

  return (
    <div className="bg-white rounded-lg shadow mb-6">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center text-lg font-semibold text-gray-900 hover:text-gray-700"
          >
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                {activeFilterCount}
              </span>
            )}
            <svg
              className={`ml-2 h-5 w-5 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search barcode or name..."
                value={localFilters.search || ''}
                onChange={(e) => updateFilter('search', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="form-input w-64 pr-10"
              />
              <button
                onClick={handleSubmit}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="p-6 space-y-4">
          {loading && (
            <div className="text-center py-4 text-gray-500">Loading filter options...</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Study Filter - Searchable */}
            <div>
              <label htmlFor="filter-study" className="block text-sm font-medium mb-2 text-gray-700">
                Study
              </label>
              <div className="relative">
                <button
                  type="button"
                  id="filter-study"
                  onClick={() => setStudyPickerOpen(true)}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {selectedStudy ? (
                    <span className="block truncate">
                      {selectedStudy.shortCode} - {selectedStudy.title}
                    </span>
                  ) : (
                    <span className="text-gray-400">All Studies</span>
                  )}
                </button>
                {localFilters.study && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      updateFilter('study', '')
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {studyPickerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black bg-opacity-30"
                    onClick={() => setStudyPickerOpen(false)}
                  />
                  <div className="relative z-50 w-full max-w-3xl mx-4 bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900">Select Study</h2>
                      <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={() => setStudyPickerOpen(false)}
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="mb-4">
                      <input
                        type="text"
                        value={studySearch}
                        onChange={(e) => setStudySearch(e.target.value)}
                        placeholder="Search by title or short code…"
                        className="w-full form-input"
                        autoFocus
                      />
                    </div>

                    <div className="border border-gray-100 rounded-lg max-h-80 overflow-y-auto">
                      {studyLoading ? (
                        <div className="p-4 text-sm text-gray-500">Loading studies…</div>
                      ) : studies.length === 0 ? (
                        <div className="p-4 text-sm text-gray-500">No studies found.</div>
                      ) : (
                        <ul className="divide-y divide-gray-200">
                          <li>
                            <button
                              type="button"
                              className="w-full px-4 py-3 text-left hover:bg-gray-50"
                              onClick={() => {
                                updateFilter('study', '')
                                setStudyPickerOpen(false)
                                setStudySearch('')
                              }}
                            >
                              <p className="text-sm font-medium text-gray-900">All Studies</p>
                              <p className="text-xs text-gray-500">Clear study filter</p>
                            </button>
                          </li>
                          {studies.map((study) => (
                            <li key={study.id}>
                              <button
                                type="button"
                                className="w-full px-4 py-3 text-left hover:bg-gray-50"
                                onClick={() => {
                                  updateFilter('study', study.shortCode)
                                  setStudyPickerOpen(false)
                                  setStudySearch('')
                                }}
                              >
                                <p className="text-sm font-medium text-gray-900">{study.title}</p>
                                <p className="text-xs text-gray-500">{study.shortCode}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Source Type Filter */}
            <div>
              <label htmlFor="filter-source-type" className="block text-sm font-medium mb-2 text-gray-700">
                Source Type
              </label>
              <select
                id="filter-source-type"
                value={localFilters.sourceType || ''}
                onChange={(e) => updateFilter('sourceType', e.target.value)}
                className="w-full form-select"
              >
                {SOURCE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Specimen Type Filter */}
            <div>
              <label htmlFor="filter-specimen-type" className="block text-sm font-medium mb-2 text-gray-700">
                Specimen Type
              </label>
              <select
                id="filter-specimen-type"
                value={localFilters.specimenTypeId || ''}
                onChange={(e) => updateFilter('specimenTypeId', e.target.value)}
                className="w-full form-select"
              >
                <option value="">All Types</option>
                {specimenTypes.map((type) => (
                  <option key={type.id} value={type.id.toString()}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Collection Date Range */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Collection Date From
              </label>
              <input
                type="date"
                value={localFilters.collectionDateFrom || ''}
                onChange={(e) => updateFilter('collectionDateFrom', e.target.value)}
                className="w-full form-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Collection Date To
              </label>
              <input
                type="date"
                value={localFilters.collectionDateTo || ''}
                onChange={(e) => updateFilter('collectionDateTo', e.target.value)}
                className="w-full form-input"
              />
            </div>

            {/* Created Date Range */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Created Date From
              </label>
              <input
                type="date"
                value={localFilters.createdFrom || ''}
                onChange={(e) => updateFilter('createdFrom', e.target.value)}
                className="w-full form-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Created Date To
              </label>
              <input
                type="date"
                value={localFilters.createdTo || ''}
                onChange={(e) => updateFilter('createdTo', e.target.value)}
                className="w-full form-input"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t space-x-3">
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-100 rounded-lg hover:bg-gray-50"
              disabled={isLoading}
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !hasChanges}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

