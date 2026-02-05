import { useState, useEffect, useMemo, useRef } from 'react'
import { studiesApi, type Study } from '../lib/api'
import { specimenTypesApi, type SpecimenType } from '../lib/api'
import ModalPortal from './ModalPortal'

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
  const [localFilters, setLocalFilters] = useState<SpecimenFilters>(filters)
  const prevFiltersRef = useRef<SpecimenFilters>(filters)
  const [studies, setStudies] = useState<Study[]>([])
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [loading, setLoading] = useState(false)
  const [studyPickerOpen, setStudyPickerOpen] = useState(false)
  const [studySearch, setStudySearch] = useState('')
  const [studyLoading, setStudyLoading] = useState(false)

  // Sync local filters when external filters change (during render to avoid extra pass)
  if (filters !== prevFiltersRef.current) {
    prevFiltersRef.current = filters
    setLocalFilters(filters)
  }

  useEffect(() => {
    loadReferenceData()
  }, [])

  const loadReferenceData = async () => {
    try {
      setLoading(true)
      const [specimenTypesRes] = await Promise.all([
        specimenTypesApi.list().catch(() => ({ data: [] })),
      ])
      setSpecimenTypes(specimenTypesRes.data)
    } catch (error) {
      console.error('Failed to load reference data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!studyPickerOpen) return
    let ignore = false
    const timeout = setTimeout(async () => {
      try {
        setStudyLoading(true)
        const response = await studiesApi.list(studySearch || undefined)
        if (!ignore) {
          setStudies(response.studies || [])
        }
      } catch (error) {
        if (!ignore) {
          console.error('Failed to load studies:', error)
        }
      } finally {
        if (!ignore) {
          setStudyLoading(false)
        }
      }
    }, 300)
    return () => {
      ignore = true
      clearTimeout(timeout)
    }
  }, [studySearch, studyPickerOpen])

  const loadStudies = async () => {
    try {
      setStudyLoading(true)
      const response = await studiesApi.list(studySearch || undefined)
      setStudies(response.studies || [])
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            {hasActiveFilters && (
              <span className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search subject, batch, or type..."
                value={localFilters.search || ''}
                onChange={(e) => updateFilter('search', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="form-input w-80 pr-10 rounded-lg"
              />
              <button
                onClick={handleSubmit}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
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
                  onClick={() => {
                setStudyPickerOpen(true)
                void loadStudies()
              }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors hover:border-gray-400"
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
                <ModalPortal>
                  <div className="fixed inset-0 z-[100] overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                      {/* Background overlay */}
                      <div
                        className="fixed inset-0 bg-gray-900/40 backdrop-blur-md"
                        onClick={() => setStudyPickerOpen(false)}
                      />
                    {/* Modal panel */}
                    <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
                      <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
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
                            className="w-full form-input rounded-lg"
                            autoFocus
                          />
                        </div>

                        <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
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
                  </div>
                </div>
                </ModalPortal>
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
                className="w-full form-select rounded-lg"
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
                className="w-full form-select rounded-lg"
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
                className="w-full form-input rounded-lg"
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
                className="w-full form-input rounded-lg"
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
                className="w-full form-input rounded-lg"
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
                className="w-full form-input rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-gray-200 space-x-3">
            <button
              type="button"
              onClick={clearFilters}
              className="subject-specimen-btn-secondary disabled:opacity-50"
              disabled={isLoading}
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || !hasChanges}
              className="subject-specimen-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
      </div>
    </div>
  )
}

