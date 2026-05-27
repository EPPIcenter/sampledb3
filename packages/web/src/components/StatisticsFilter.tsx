import { useState, useEffect, useMemo, useRef } from 'react'
import { studiesApi } from '../lib/api/studies';
import type { Study } from '../lib/api/studies';
import { specimenTypesApi } from '../lib/api/reference-data';
import type { SpecimenType } from '../lib/api/types';
import { tagsApi } from '../lib/api/reference-data';
import type { Tag } from '../lib/api/reference-data';
import LocationTreePicker, { type LocationSelection } from './LocationTreePicker'
import ModalPortal from './ModalPortal'

export interface StatisticsFilters {
  study?: string
  sourceType?: string
  specimenTypeId?: string
  containerType?: string
  tagIds?: string[] // Array of tag IDs for filtering
  collectionDateFrom?: string
  collectionDateTo?: string
  createdFrom?: string
  createdTo?: string
  locationId?: string
  locationSelections?: LocationSelection[]
}

interface StatisticsFilterProps {
  filters: StatisticsFilters
  onChange: (filters: StatisticsFilters) => void
  onSubmit: (filters: StatisticsFilters) => void
  isLoading?: boolean
  /** Optional class for the outer card (e.g. statistics-card when inside .statistics-page). */
  className?: string
}

const SOURCE_TYPES = [
  { value: '', label: 'All' },
  { value: 'subject', label: 'Subject' },
  { value: 'control', label: 'Control' },
  { value: 'reagent', label: 'Reagent' },
  { value: 'cell_line', label: 'Cell Line' },
  { value: 'plasmid', label: 'Plasmid' },
  { value: 'standard', label: 'Standard' },
]

const CONTAINER_TYPES = [
  { value: '', label: 'All' },
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

export default function StatisticsFilter({ filters, onChange, onSubmit, isLoading = false, className }: StatisticsFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<StatisticsFilters>(filters)
  const prevFiltersRef = useRef<StatisticsFilters>(filters)
  const [studies, setStudies] = useState<Study[]>([])
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [tags, setTags] = useState<Tag[]>([])
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
    if (isOpen) {
      loadReferenceData()
    }
  }, [isOpen])

  const loadReferenceData = async () => {
    try {
      setLoading(true)
      const [specimenTypesRes, tagsRes] = await Promise.all([
        specimenTypesApi.list().catch(() => ({ data: [] })),
        tagsApi.list().catch(() => ({ data: [] })),
      ])
      setSpecimenTypes(specimenTypesRes.data)
      setTags(tagsRes.data)
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
      setStudies(response.studies)
    } catch (error) {
      console.error('Failed to load studies:', error)
    } finally {
      setStudyLoading(false)
    }
  }

  const selectedStudy = studies.find((s) => s.shortCode === localFilters.study)

  const updateFilter = (key: keyof StatisticsFilters, value: string | string[]) => {
    const newFilters = { ...localFilters }
    if (value === '' || (Array.isArray(value) && value.length === 0)) {
      delete newFilters[key]
    } else {
      newFilters[key] = value as any
    }
    setLocalFilters(newFilters)
    // Update parent for display purposes (e.g., showing active filter count)
    onChange(newFilters)
  }

  // Convert location selections to filter format
  const locationSelections = useMemo(() => {
    // If we have stored selections, use those
    if (localFilters.locationSelections && localFilters.locationSelections.length > 0) {
      return localFilters.locationSelections
    }

    // Otherwise, build from locationId if available
    const selections: LocationSelection[] = []

    if (localFilters.locationId) {
      selections.push({
        locationId: parseInt(localFilters.locationId),
        path: `Location #${localFilters.locationId}`,
        name: `Location #${localFilters.locationId}`,
      })
    }

    return selections
  }, [localFilters.locationId, localFilters.locationSelections])

  const handleLocationChange = (selections: LocationSelection[]) => {
    const newFilters = { ...localFilters }

    // Clear location filters
    delete newFilters.locationId

    // Store all selections - support multiple locations
    if (selections.length > 0) {
      newFilters.locationSelections = selections
      // For API compatibility, also set the first location selection as the primary filter
      // The API currently only supports single location, so we use the first one
      const firstSelection = selections[0]!
      newFilters.locationId = firstSelection.locationId.toString()
    } else {
      delete newFilters.locationSelections
    }

    setLocalFilters(newFilters)
    onChange(newFilters)
  }

  const handleSubmit = () => {
    onSubmit(localFilters)
  }

  const clearFilters = () => {
    const emptyFilters: StatisticsFilters = {}
    setLocalFilters(emptyFilters)
    onChange(emptyFilters)
    onSubmit(emptyFilters)
  }

  const hasActiveFilters = Object.keys(localFilters).length > 0
  const hasChanges = JSON.stringify(localFilters) !== JSON.stringify(filters)

  const rootClassName = className ? `${className} overflow-hidden` : 'bg-app-card rounded-lg shadow mb-6'

  return (
    <div className={rootClassName}>
      <div className="p-4 border-b border-app-border">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center text-lg font-semibold text-app-text hover:text-app-text"
          >
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-app-accent-muted text-app-accent-hover rounded">
                {Object.keys(localFilters).length}
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
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-app-accent hover:text-app-accent-hover"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="p-6 space-y-4">
          {loading && (
            <div className="text-center py-4 text-app-text-muted">Loading filter options...</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Study Filter - Searchable */}
            <div>
              <label htmlFor="filter-study" className="block text-sm font-medium mb-2 text-app-text">
                Study
              </label>
              <div className="relative">
                <button
                  type="button"
                  id="filter-study"
                  onClick={() => setStudyPickerOpen(true)}
                  className="w-full px-3 py-2 border border-app-border rounded-md shadow-sm bg-app-card text-left focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                >
                  {selectedStudy ? (
                    <span className="block truncate">
                      {selectedStudy.shortCode} - {selectedStudy.title}
                    </span>
                  ) : (
                    <span className="text-app-text-muted">All Studies</span>
                  )}
                </button>
                {localFilters.study && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      updateFilter('study', '')
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text"
                    aria-label="Clear study filter"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {studyPickerOpen && (
                <ModalPortal>
                  <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div
                      className="fixed inset-0 bg-black/40 backdrop-blur-md"
                      onClick={() => setStudyPickerOpen(false)}
                    />
                  <div className="relative z-10 w-full max-w-3xl mx-4 bg-app-card rounded-lg shadow-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-app-text">Select Study</h2>
                      <button
                        type="button"
                        className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded"
                        onClick={() => setStudyPickerOpen(false)}
                        aria-label="Close study selection dialog"
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="mb-4">
                      <label htmlFor="study-search" className="sr-only">
                        Search studies
                      </label>
                      <input
                        id="study-search"
                        type="text"
                        value={studySearch}
                        onChange={(e) => setStudySearch(e.target.value)}
                        placeholder="Search by title or short code…"
                        className="w-full form-input"
                        autoFocus
                      />
                    </div>

                    <div className="border border-app-border rounded-md max-h-80 overflow-y-auto">
                      {studyLoading ? (
                        <div className="p-4 text-sm text-app-text-muted">Loading studies…</div>
                      ) : studies.length === 0 ? (
                        <div className="p-4 text-sm text-app-text-muted">No studies found.</div>
                      ) : (
                        <ul className="divide-y divide-app-border">
                          <li>
                            <button
                              type="button"
                              className="w-full px-4 py-3 text-left hover:bg-app-surface focus:outline-none focus:bg-app-surface focus-visible:ring-2 focus-visible:ring-app-accent rounded"
                              onClick={() => {
                                updateFilter('study', '')
                                setStudyPickerOpen(false)
                                setStudySearch('')
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-app-text">All Studies</p>
                                  <p className="text-xs text-app-text-muted">Clear study filter</p>
                                </div>
                              </div>
                            </button>
                          </li>
                          {studies.map((study) => (
                            <li key={study.id}>
                              <button
                                type="button"
                                className="w-full px-4 py-3 text-left hover:bg-app-surface focus:outline-none focus:bg-app-surface focus-visible:ring-2 focus-visible:ring-app-accent rounded"
                                onClick={() => {
                                  updateFilter('study', study.shortCode)
                                  setStudyPickerOpen(false)
                                  setStudySearch('')
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-app-text">
                                      {study.title}
                                    </p>
                                    <p className="text-xs text-app-text-muted">
                                      {study.shortCode}
                                      {study.leadPerson ? ` • Lead: ${study.leadPerson}` : ''}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
                </ModalPortal>
              )}
            </div>

            {/* Source Type Filter */}
            <div>
              <label htmlFor="filter-source-type" className="block text-sm font-medium mb-2 text-app-text">
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
              <label htmlFor="filter-specimen-type" className="block text-sm font-medium mb-2 text-app-text">
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

            {/* Container Type Filter */}
            <div>
              <label htmlFor="filter-container-type" className="block text-sm font-medium mb-2 text-app-text">
                Container Type
              </label>
              <select
                id="filter-container-type"
                value={localFilters.containerType || ''}
                onChange={(e) => updateFilter('containerType', e.target.value)}
                className="w-full form-select"
              >
                {CONTAINER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag Filter (checkboxes) */}
            <div>
              <label className="block text-sm font-medium mb-2 text-app-text">
                Tags (must have all selected)
              </label>
              <div className="border border-app-border rounded-md p-2 max-h-40 overflow-y-auto">
                {tags.length === 0 ? (
                  <p className="text-sm text-app-text-muted">No tags available</p>
                ) : (
                  <div className="space-y-1.5">
                    {tags.map((tag) => {
                      const isChecked = localFilters.tagIds?.includes(tag.id.toString()) || false
                      return (
                        <label
                          key={tag.id}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-app-surface p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const currentTagIds = localFilters.tagIds || []
                              const newTagIds = e.target.checked
                                ? [...currentTagIds, tag.id.toString()]
                                : currentTagIds.filter(id => id !== tag.id.toString())
                              updateFilter('tagIds', newTagIds)
                            }}
                            className="rounded border-app-border text-app-accent focus:ring-app-accent"
                          />
                          <span className="text-sm text-app-text">{tag.name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              {localFilters.tagIds && localFilters.tagIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateFilter('tagIds', [])}
                  className="mt-2 text-xs text-app-accent hover:text-app-accent-hover underline"
                >
                  Clear all tags
                </button>
              )}
            </div>

            {/* Collection Date From */}
            <div>
              <label htmlFor="filter-collection-date-from" className="block text-sm font-medium mb-2 text-app-text">
                Collection Date From
              </label>
              <input
                id="filter-collection-date-from"
                type="date"
                value={localFilters.collectionDateFrom || ''}
                onChange={(e) => updateFilter('collectionDateFrom', e.target.value)}
                className="w-full form-input"
              />
            </div>

            {/* Collection Date To */}
            <div>
              <label htmlFor="filter-collection-date-to" className="block text-sm font-medium mb-2 text-app-text">
                Collection Date To
              </label>
              <input
                id="filter-collection-date-to"
                type="date"
                value={localFilters.collectionDateTo || ''}
                onChange={(e) => updateFilter('collectionDateTo', e.target.value)}
                className="w-full form-input"
              />
            </div>

            {/* Created From */}
            <div>
              <label htmlFor="filter-created-from" className="block text-sm font-medium mb-2 text-app-text">
                Created From
              </label>
              <input
                id="filter-created-from"
                type="date"
                value={localFilters.createdFrom || ''}
                onChange={(e) => updateFilter('createdFrom', e.target.value)}
                className="w-full form-input"
              />
            </div>

            {/* Created To */}
            <div>
              <label htmlFor="filter-created-to" className="block text-sm font-medium mb-2 text-app-text">
                Created To
              </label>
              <input
                id="filter-created-to"
                type="date"
                value={localFilters.createdTo || ''}
                onChange={(e) => updateFilter('createdTo', e.target.value)}
                className="w-full form-input"
              />
            </div>

            {/* Location Filter */}
            <div className="lg:col-span-3">
              <label htmlFor="filter-location" className="block text-sm font-medium mb-2 text-app-text">
                Location
              </label>
              <LocationTreePicker
                selected={locationSelections}
                onChange={handleLocationChange}
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-between pt-4 border-t border-app-border">
            <div className="text-sm text-app-text-muted">
              {hasChanges && (
                <span className="text-amber-600">You have unsaved filter changes</span>
              )}
              {!hasChanges && hasActiveFilters && (
                <span>Filters applied</span>
              )}
            </div>
            <div className="flex gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm font-medium text-app-text bg-app-card border border-app-border rounded-md hover:bg-app-surface focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-2"
                  disabled={isLoading}
                >
                  Clear All
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || !hasChanges}
                className="px-6 py-2 text-sm font-medium text-white bg-app-accent border border-transparent rounded-md hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Loading...</span>
                  </>
                ) : (
                  <span>Apply Filters</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

